import type { Handle, HandleServerError } from '@sveltejs/kit';
import { SESSION_COOKIE, validateSession } from '$lib/server/auth';
import { describeError } from '$lib/server/api-error';

const PUBLIC_ROUTES = ['/login', '/api/login', '/manifest.webmanifest', '/favicon.svg'];

export const handle: Handle = async ({ event, resolve }) => {
	const sid = event.cookies.get(SESSION_COOKIE);
	const authed = await validateSession(sid);
	event.locals.authed = authed;

	const path = event.url.pathname;
	const isPublic =
		PUBLIC_ROUTES.includes(path) ||
		path.startsWith('/_app/') ||
		path.startsWith('/icons/') ||
		path.startsWith('/static/');

	if (!authed && !isPublic) {
		if (path.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		return new Response(null, {
			status: 303,
			headers: { location: '/login?next=' + encodeURIComponent(path) }
		});
	}

	return resolve(event);
};

/**
 * Last-resort transform for anything an `/api/*` route didn't catch
 * itself. Pins the body shape to `{ error: ... }` regardless of the
 * underlying cause so clients never see a default SvelteKit
 * `{message}` payload on an unexpected failure.
 *
 * Note: SvelteKit doesn't let `handleError` change the status code —
 * unhandled exceptions stay as 500. Each route is therefore
 * responsible for catching constraint violations (UNIQUE, FK, etc.)
 * and re-throwing as `apiError(400, ...)` so the caller gets a real
 * 4xx instead.
 */
export const handleError: HandleServerError = ({ error }) => {
	if (error instanceof Error) {
		return { error: describeError(error) };
	}
	return { error: 'internal error' };
};
