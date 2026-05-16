declare global {
	namespace App {
		interface Locals {
			authed: boolean;
		}
		/**
		 * Pinned body shape for every `throw error()` / `apiError()`
		 * response. We keep `error` as the canonical field so external
		 * clients can rely on a single `body.error` across the whole API
		 * surface; `message` mirrors it because SvelteKit's own
		 * `App.Error` contract (since kit 2.60) requires a `message`
		 * field on every error body. Both fields hold the same string.
		 *
		 * `errorId` is only set on 500 responses by the `handleError`
		 * hook — clients can quote it when reporting bugs so we can
		 * find the matching server-side log entry without exposing
		 * the underlying stack trace.
		 */
		interface Error {
			message: string;
			error: string;
			errorId?: string;
		}
	}
}

export {};
