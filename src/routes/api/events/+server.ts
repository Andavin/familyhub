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
	let ownClientId: string | undefined;
	if (rawCid !== null) {
		if (rawCid.length > 0 && rawCid.length <= MAX_CLIENT_ID_LEN) {
			ownClientId = rawCid;
		} else {
			// Don't trust an oversized or empty id, but log it so we notice
			// if a real client starts shipping malformed cids (vs misbehaving
			// scanners we'd ignore).
			console.warn(
				`[sse] dropping malformed cid (len=${rawCid.length}); self-echo filter disabled for this connection`
			);
		}
	}

	let unsubscribe: (() => void) | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let closed = false;
	let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

	// Shared teardown for the interval + bus subscription. Idempotent
	// (guarded by `closed`) and centralized so the abort path and the
	// stream's own `cancel()` callback don't drift apart.
	//
	// `closeController` is parameterized: only the abort path needs to
	// proactively close the controller. From inside `cancel()` the
	// runtime is already tearing the stream down — calling close() at
	// that point throws ERR_INVALID_STATE.
	const teardown = ({ closeController }: { closeController: boolean }) => {
		if (closed) return;
		closed = true;
		if (heartbeat !== null) {
			clearInterval(heartbeat);
			heartbeat = null;
		}
		if (unsubscribe !== null) {
			unsubscribe();
			unsubscribe = null;
		}
		if (closeController && controllerRef) {
			try {
				controllerRef.close();
			} catch (err) {
				console.warn('[sse] controller.close failed', err);
			}
		}
		controllerRef = null;
	};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controllerRef = controller;
			const encoder = new TextEncoder();

			const enqueue = (chunk: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch (err) {
					// Controller died mid-write — typically because the client
					// hung up between our `closed` check and the enqueue call.
					// Log it (so we don't silently neuter the stream) and run
					// cleanup actively: otherwise heartbeats keep firing into
					// a dead controller and the browser's EventSource thinks
					// it's still subscribed.
					console.warn('[sse] enqueue failed; tearing down stream', err);
					teardown({ closeController: true });
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

			// `request.signal` aborts when the client disconnects (tab close,
			// navigation, network drop). Without this listener the bus would
			// leak one stale subscriber per dropped connection.
			const onAbort = () => teardown({ closeController: true });
			if (request.signal.aborted) {
				onAbort();
			} else {
				request.signal.addEventListener('abort', onAbort, { once: true });
			}
		},
		cancel() {
			// The runtime is tearing the stream down for us — don't try
			// to close the controller (it's already in a terminal state).
			teardown({ closeController: false });
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
