import { error as svelteError } from '@sveltejs/kit';

/**
 * Throw a structured API error with a consistent body shape.
 *
 * Always produces `{ "error": "<message>" }` on the wire — pinned by
 * the `App.Error` declaration in `src/app.d.ts`. Used in place of both
 * `throw error()` (SvelteKit's default body is `{message}`) and
 * `return json({error}, {status})` so every route emits the same
 * shape regardless of which idiom the original author preferred.
 */
export function apiError(status: number, message: string): never {
	throw svelteError(status, { error: message });
}

/**
 * Pulls a user-facing message out of an unknown error.
 *
 * Used by catch blocks that need to turn a database / library error
 * into a 4xx — recognises a couple of common SQLite signals and
 * falls back to a generic phrasing.
 */
export function describeError(err: unknown): string {
	if (err instanceof Error) {
		const msg = err.message;
		if (msg.includes('UNIQUE constraint failed')) return 'value already exists';
		if (msg.includes('FOREIGN KEY constraint failed')) return 'reference not found';
		if (msg.includes('NOT NULL constraint failed')) return 'required field missing';
		return msg;
	}
	return 'unknown error';
}

