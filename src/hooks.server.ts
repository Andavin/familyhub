import type { Handle, HandleServerError } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { SESSION_COOKIE, validateSession } from '$lib/server/auth';

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
			return new Response(JSON.stringify({ message: 'unauthorized', error: 'unauthorized' }), {
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
 * Last-resort handler for anything a route didn't catch itself.
 *
 * Policy: a 500 means the server failed in a way the client can't
 * remediate. The full details (message, stack, request) are logged
 * server-side under a short `errorId` so we can find them later; the
 * client only sees `{ error: "internal server error", errorId }`.
 * No stack traces, no SQL, no internals.
 *
 * Validation, constraint-handling, and user-fixable mistakes are
 * supposed to come back as 4xx from `apiError(...)` inside the
 * routes — anything reaching this hook is a server bug we need to
 * fix, not something the client should debug.
 */
export const handleError: HandleServerError = ({ error, event }) => {
	const errorId = randomBytes(6).toString('hex');
	console.error(
		`[handleError] errorId=${errorId} ${event.request.method} ${event.url.pathname}`,
		error
	);
	const msg = 'internal server error';
	return { message: msg, error: msg, errorId };
};
