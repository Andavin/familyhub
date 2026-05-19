import { browser } from '$app/environment';
import { invalidate } from '$app/navigation';
import { CHANNELS, dep } from '$lib/channels';

let source: EventSource | null = null;
let attempted = false;
let clientId: string | null = null;
let fetchPatched = false;

const CLIENT_ID_HEADER = 'x-fh-client-id';

/**
 * Per-tab UUID used for SSE self-echo suppression. Generated lazily on
 * first need so the import has no side effects, and stable for the
 * lifetime of the tab. The server reads the same id off the
 * `X-FH-Client-Id` header on mutations (see `installFetchInterceptor`)
 * and skips broadcasting to the SSE connection identified by that id.
 */
export function getClientId(): string {
	if (clientId) return clientId;
	// `crypto.randomUUID` is available everywhere we target. Falling
	// back to a manual generator if a very old runtime ever lands here
	// would be over-engineering; we'd notice in CI before users.
	clientId = crypto.randomUUID();
	return clientId;
}

/**
 * Monkey-patch `window.fetch` so every same-origin API call carries
 * the client id header. This lets the server attribute the mutation
 * back to the originating tab and skip broadcasting to that tab's SSE
 * stream. Component code stays unchanged — every existing `fetch('/api/...')`
 * call picks up the header transparently.
 *
 * Scoped to `/api/*` so external fetches (e.g. third-party JS) don't
 * leak our internal id. The SSE GET itself doesn't need the header
 * because the id is also passed as a query param on the EventSource URL.
 */
function installFetchInterceptor(): void {
	if (!browser || fetchPatched) return;
	fetchPatched = true;
	const originalFetch = window.fetch.bind(window);
	window.fetch = (input, init) => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof URL
					? input.href
					: input.url;
		// Only inject the header for our own API surface, and not on the
		// SSE endpoint itself (which carries the id via query param).
		if (
			typeof url === 'string' &&
			url.startsWith('/api/') &&
			!url.startsWith('/api/events')
		) {
			const headers = new Headers(init?.headers ?? {});
			if (!headers.has(CLIENT_ID_HEADER)) {
				headers.set(CLIENT_ID_HEADER, getClientId());
			}
			return originalFetch(input, { ...init, headers });
		}
		return originalFetch(input, init);
	};
}

/**
 * Open the singleton EventSource for `/api/events` and route each
 * incoming server-sent event into a SvelteKit invalidation. Returns a
 * cleanup function that closes the connection.
 *
 * Safe to call multiple times: subsequent calls during the same page
 * lifetime are no-ops (we already have an open stream). Idempotent
 * cleanup as well.
 *
 * Notes:
 *  - The browser's `EventSource` retries with exponential backoff on
 *    its own. We don't need a reconnect loop — just don't tear it down.
 *  - On reconnect, the client missed whatever events fired during the
 *    gap. We always invalidate every channel once on `ready` so a
 *    reconnected tab catches up on whatever changed while it was gone.
 */
export function startRealtime(): () => void {
	if (!browser) return () => {};
	if (source) return stopRealtime;
	attempted = true;

	// Patch fetch before we open the SSE connection so the very first
	// mutation a user fires already carries the client id header.
	installFetchInterceptor();

	const cid = encodeURIComponent(getClientId());
	const es = new EventSource(`/api/events?cid=${cid}`);
	source = es;

	for (const channel of CHANNELS) {
		es.addEventListener(channel, () => {
			invalidate(dep(channel));
		});
	}

	// On (re)connect, force a refresh of every channel. The first
	// `ready` after page load is redundant with the loader's own data,
	// but it's also harmless — SvelteKit dedupes pending invalidations
	// and a fresh page has nothing stale to throw away. On reconnect
	// it's load-bearing: any events emitted while the EventSource was
	// closed are gone, so we re-fetch everything to converge.
	es.addEventListener('ready', () => {
		for (const channel of CHANNELS) {
			invalidate(dep(channel));
		}
	});

	// EventSource fires `error` on transient failures too — readyState
	// === CLOSED means it gave up retrying. Log only that hard case;
	// transient errors will reconnect automatically.
	es.addEventListener('error', () => {
		if (es.readyState === EventSource.CLOSED) {
			console.warn('[realtime] EventSource closed (will not auto-reconnect)');
		}
	});

	return stopRealtime;
}

export function stopRealtime(): void {
	if (source) {
		source.close();
		source = null;
	}
}

/**
 * Test-only: read the current connection state without exposing the
 * EventSource instance. Returns 'closed' before the first start
 * attempt or after explicit stop, and the readable EventSource state
 * once a connection has been opened.
 */
export function realtimeState(): 'closed' | 'connecting' | 'open' | 'reconnecting' {
	if (!source) return attempted ? 'closed' : 'closed';
	switch (source.readyState) {
		case EventSource.CONNECTING:
			return 'connecting';
		case EventSource.OPEN:
			return 'open';
		case EventSource.CLOSED:
		default:
			return 'reconnecting';
	}
}
