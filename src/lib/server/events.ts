import { EventEmitter } from 'node:events';
import type { Channel } from '$lib/channels';
import { currentClientId } from './request-context';

/**
 * Channel constants live in `$lib/channels` so the client realtime
 * subscriber can import them without pulling in server-only modules.
 * Re-exported here for ergonomic server-side imports.
 */
export { CHANNELS, isChannel } from '$lib/channels';
export type { Channel } from '$lib/channels';

/**
 * Single in-process bus. Every connected SSE client attaches one
 * listener; mutation endpoints emit via `broadcast(...)`. We disable
 * the default max-listener cap because each browser tab opens its own
 * EventSource — a family of five with multiple devices easily exceeds
 * Node's default 10.
 *
 * This is a singleton on purpose. A multi-process deploy would need a
 * pub/sub backplane (Redis, Postgres LISTEN/NOTIFY) but this app runs
 * as a single Node process so the in-memory bus is sufficient.
 */
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const CHANGE_EVENT = 'change';

/**
 * Broadcast a change on a channel. The originating client id is read
 * from the per-request `AsyncLocalStorage` so callers don't have to
 * thread it through call sites; the SSE endpoint uses it to suppress
 * self-echo (the originating tab already updated optimistically).
 *
 * The optional `originIdOverride` is for callers that don't have a
 * request context — typically tests or background jobs.
 */
export function broadcast(channel: Channel, originIdOverride?: string): void {
	const originId = originIdOverride ?? currentClientId();
	emitter.emit(CHANGE_EVENT, channel, originId);
}

export function subscribe(
	handler: (channel: Channel, originId: string | undefined) => void
): () => void {
	emitter.on(CHANGE_EVENT, handler);
	return () => {
		emitter.off(CHANGE_EVENT, handler);
	};
}

export function listenerCount(): number {
	return emitter.listenerCount(CHANGE_EVENT);
}
