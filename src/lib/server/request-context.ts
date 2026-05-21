import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context propagated by `hooks.server.ts` so server-side
 * code can read request-scoped values without threading them through
 * every function signature.
 *
 * Currently carries the client id (`X-FH-Client-Id` header) so the
 * realtime broadcaster can attribute a mutation back to the browser
 * tab that initiated it. The SSE handler uses that to suppress
 * "self-echo" events — the originating tab already updated optimistically,
 * so re-rendering on its own broadcast just causes flicker and lost
 * scroll position.
 */
export type RequestContext = {
	clientId?: string;
};

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** Returns the current client id, if any. */
export function currentClientId(): string | undefined {
	return requestContext.getStore()?.clientId;
}
