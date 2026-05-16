declare global {
	namespace App {
		interface Locals {
			authed: boolean;
		}
		/**
		 * Pinned body shape for every `throw error()` / `apiError()`
		 * response. Distinct from SvelteKit's default `{message}` so
		 * external clients see a single consistent `body.error` field
		 * across the whole API surface.
		 *
		 * `errorId` is only set on 500 responses by the `handleError`
		 * hook — clients can quote it when reporting bugs so we can
		 * find the matching server-side log entry without exposing
		 * the underlying stack trace.
		 */
		interface Error {
			error: string;
			errorId?: string;
		}
	}
}

export {};
