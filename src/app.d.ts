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
		 */
		interface Error {
			error: string;
		}
	}
}

export {};
