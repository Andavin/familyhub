import type { Channel } from '$lib/channels';
import { currentClientId } from './request-context';

export { CHANNELS, isChannel } from '$lib/channels';
export type { Channel } from '$lib/channels';

type Handler = (channel: Channel, originId: string | undefined) => void;

/**
 * Single in-process bus. Every connected SSE client attaches one
 * handler; mutation endpoints emit via `broadcast(...)`. Singleton on
 * purpose — a multi-process deploy would need a pub/sub backplane
 * (Redis, Postgres LISTEN/NOTIFY) but this app runs as a single Node
 * process, so an in-memory `Set` is sufficient.
 *
 * We don't use `EventEmitter` because its rethrow-on-handler-throw
 * semantics let one buggy subscriber abort delivery to every other
 * subscriber — exactly the "broadcast quietly dies for N-1 tabs"
 * failure mode this layer must avoid. With a plain `Set` we can wrap
 * each handler call defensively.
 */
const handlers = new Set<Handler>();

/**
 * Broadcast a change on a channel. The originating client id is read
 * from the per-request `AsyncLocalStorage` so callers don't have to
 * thread it through call sites; the SSE endpoint uses it to suppress
 * self-echo (the originating tab already updated optimistically).
 *
 * The optional `originIdOverride` is for callers that don't have a
 * request context — typically tests or background jobs.
 *
 * Handler exceptions are caught and logged, never propagated. A
 * misbehaving SSE connection must not crash a mutation route or
 * silently skip other connected tabs.
 */
export function broadcast(channel: Channel, originIdOverride?: string): void {
	const originId = originIdOverride ?? currentClientId();
	// Snapshot handlers so a subscribe/unsubscribe during emit can't
	// shift the iteration. Set iteration is insertion-ordered.
	for (const h of [...handlers]) {
		try {
			h(channel, originId);
		} catch (err) {
			console.warn('[events] subscriber threw; continuing', { channel, err });
		}
	}
}

export function subscribe(handler: Handler): () => void {
	handlers.add(handler);
	return () => {
		handlers.delete(handler);
	};
}

export function listenerCount(): number {
	return handlers.size;
}
