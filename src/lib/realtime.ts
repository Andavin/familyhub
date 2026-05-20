import { browser } from '$app/environment';
import { invalidate } from '$app/navigation';
import { CHANNELS, dep } from '$lib/channels';

let source: EventSource | null = null;
let clientId: string | null = null;
let fetchPatched = false;

const CLIENT_ID_HEADER = 'x-fh-client-id';

/**
 * Decide whether a given fetch target should carry the client id
 * header. We need same-origin `/api/*` (so the server can attribute
 * the mutation back to this tab) but not `/api/events` itself (the id
 * goes in `?cid=` there) and not cross-origin fetches (would leak
 * our internal id to third parties).
 *
 * Handles all three `fetch` input shapes — string, URL, Request — and
 * resolves relative paths against `location.origin` so a caller using
 * `fetch(new URL('/api/foo', location.origin))` is treated the same
 * as `fetch('/api/foo')`.
 */
function shouldInjectClientId(input: RequestInfo | URL): boolean {
	const raw =
		typeof input === 'string'
			? input
			: input instanceof URL
				? input.href
				: input.url;
	try {
		const u = new URL(raw, location.origin);
		return (
			u.origin === location.origin &&
			u.pathname.startsWith('/api/') &&
			!u.pathname.startsWith('/api/events')
		);
	} catch {
		// Malformed URL: skip injection rather than throw. The downstream
		// fetch will reject the request and surface the error to the caller.
		return false;
	}
}

/**
 * Per-tab UUID used for SSE self-echo suppression. Stable for the
 * lifetime of the tab. The same id is passed as `?cid=` on the
 * EventSource URL and as `X-FH-Client-Id` on outgoing API requests;
 * the SSE handler matches the two and skips delivering broadcasts a
 * stream caused itself.
 */
export function getClientId(): string {
	if (clientId) return clientId;
	clientId = crypto.randomUUID();
	return clientId;
}

/**
 * Monkey-patch `window.fetch` so every same-origin API call carries
 * the client id header. Scoped via `shouldInjectClientId` to same-origin
 * `/api/*` (excluding `/api/events`, where the id goes in the query).
 *
 * Called once on module init from a `browser`-only branch below — this
 * way the patch is in place before any in-page code (component
 * `onMount`, other `$effect`s) can fire a fetch, not just the first
 * mutation that runs after `startRealtime()`.
 */
function installFetchInterceptor(): void {
	if (!browser || fetchPatched) return;
	fetchPatched = true;
	const originalFetch = window.fetch.bind(window);
	window.fetch = (input, init) => {
		if (!shouldInjectClientId(input)) {
			return originalFetch(input, init);
		}
		const headers = new Headers(init?.headers ?? {});
		if (!headers.has(CLIENT_ID_HEADER)) {
			headers.set(CLIENT_ID_HEADER, getClientId());
		}
		return originalFetch(input, { ...init, headers });
	};
}

// Install at module-init so the patch is active before any other
// client-side code has had a chance to run. Browser-only — the import
// is a no-op on the server.
if (browser) {
	installFetchInterceptor();
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
