import { error as svelteError } from '@sveltejs/kit';

/**
 * Throw a structured API error with a consistent body shape.
 *
 * Always produces `{ "error": "<message>" }` on the wire — pinned by
 * the `App.Error` declaration in `src/app.d.ts`. Used in place of both
 * `throw error()` (SvelteKit's default body is `{message}`) and
 * `return json({error}, {status})` so every route emits the same
 * shape regardless of which idiom the original author preferred.
 *
 * Reserved for 4xx — `apiError` is the client's-fault path. Server
 * faults bubble up to `handleError` in `hooks.server.ts`, which logs
 * the full detail and returns a generic 500 without leaking
 * internals.
 */
export function apiError(status: number, message: string): never {
	throw svelteError(status, { error: message });
}
