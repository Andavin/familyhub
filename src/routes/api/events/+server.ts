import type { RequestHandler } from './$types';
import { subscribe, type Channel } from '$lib/server/events';

/**
 * Send a comment line every 25s. SSE comments (`: text`) are ignored by
 * the client but keep the TCP connection warm so reverse proxies and
 * load balancers don't kill it for being idle. 25s sits comfortably
 * below the typical 30–60s proxy idle timeout.
 */
const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * Cap how long a client id can be when it's used to filter self-echoes.
 * Anything longer than this is almost certainly malformed; we silently
 * drop it (and behave like the client supplied no id) rather than
 * spending memory on storing it.
 */
const MAX_CLIENT_ID_LEN = 100;

/**
 * Server-Sent Events stream for cross-tab/cross-device live updates.
 *
 * Each connected client gets one listener on the in-process bus. When
 * any mutation endpoint calls `broadcast('tasks')` etc., this stream
 * emits the channel name and the client invalidates the matching
 * loader (see `src/lib/realtime.ts`).
 *
 * Auth: gated by the global hook (`hooks.server.ts`) — both cookie
 * sessions and bearer API keys reach here once `locals.authed` is set.
 * An unauth request never gets past the hook.
 */
export const GET: RequestHandler = async ({ request, url }) => {
	// Each browser tab passes its own client id via `?cid=...`. We use
	// it to suppress self-echo — the tab that triggered a mutation already
	// updated optimistically, so re-rendering on its own broadcast just
	// causes flicker and (for scroll-preserving UX) visible jumps.
	const rawCid = url.searchParams.get('cid');
	const ownClientId =
		rawCid && rawCid.length > 0 && rawCid.length <= MAX_CLIENT_ID_LEN ? rawCid : undefined;

	let unsubscribe: (() => void) | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let closed = false;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();

			const enqueue = (chunk: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					// Controller closed between our check and enqueue. The abort
					// listener will run cleanup; nothing useful to do here.
					closed = true;
				}
			};

			// Initial event so the client `onopen` knows we're streaming
			// (some proxies don't surface readyState=OPEN until first byte).
			enqueue('event: ready\ndata: 1\n\n');

			unsubscribe = subscribe((channel: Channel, originId: string | undefined) => {
				// Suppress self-echo: the tab that initiated the mutation
				// already invalidated its own state, so re-running its
				// loaders again on the broadcast it caused is at best
				// redundant and at worst flickers/jumps the UI.
				if (originId && ownClientId && originId === ownClientId) return;
				// Payload is a stub object — SSE requires a `data:` line, and a
				// small JSON gives us room to add metadata (e.g. a sequence
				// number) later without changing the wire format.
				enqueue(`event: ${channel}\ndata: {}\n\n`);
			});

			heartbeat = setInterval(() => {
				enqueue(`: heartbeat ${Date.now()}\n\n`);
			}, HEARTBEAT_INTERVAL_MS);

			const cleanup = () => {
				if (closed) return;
				closed = true;
				if (heartbeat) clearInterval(heartbeat);
				if (unsubscribe) unsubscribe();
				try {
					controller.close();
				} catch {
					// already closed
				}
			};

			// `request.signal` aborts when the client disconnects (tab close,
			// navigation, network drop). Without this listener the bus would
			// leak one stale subscriber per dropped connection.
			if (request.signal.aborted) {
				cleanup();
			} else {
				request.signal.addEventListener('abort', cleanup, { once: true });
			}
		},
		cancel() {
			closed = true;
			if (heartbeat) clearInterval(heartbeat);
			if (unsubscribe) unsubscribe();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			// nginx-specific: tells the proxy not to buffer the stream.
			'x-accel-buffering': 'no'
		}
	});
};
