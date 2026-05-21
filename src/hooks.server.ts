import type { Handle, HandleServerError } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { SESSION_COOKIE, validateSession } from '$lib/server/auth';
import { extractBearerToken, findApiKey, touchApiKey } from '$lib/server/api-keys';
import { requestContext } from '$lib/server/request-context';

const PUBLIC_ROUTES = ['/login', '/api/login', '/manifest.webmanifest', '/favicon.svg'];

export const handle: Handle = async ({ event, resolve }) => {
	// Wrap the entire request lifecycle in an AsyncLocalStorage scope so
	// any server-side code (notably the realtime broadcaster) can read
	// the originating client id without threading it through call sites.
	const clientId = event.request.headers.get('x-fh-client-id') ?? undefined;
	return requestContext.run({ clientId }, () => handleRequest(event, resolve));
};

async function handleRequest(
	event: Parameters<Handle>[0]['event'],
	resolve: Parameters<Handle>[0]['resolve']
): Promise<Response> {
	const path = event.url.pathname;

	// Bearer API keys are only honored for /api/* — the kiosk UI is
	// cookie-authenticated, and accepting a bearer token on HTML routes
	// would invite confusing flows (e.g. a logged-out browser tab making
	// privileged calls because a curl experiment left a header around).
	const bearer = path.startsWith('/api/')
		? extractBearerToken(event.request.headers.get('authorization'))
		: null;
	if (bearer) {
		const key = await findApiKey(bearer);
		if (key) {
			event.locals.authed = true;
			event.locals.apiKeyId = key.id;
			event.locals.apiUserId = key.userId;
			touchApiKey(key.id);
			return resolve(event);
		}
		// A bearer token was presented but didn't match. Refuse outright
		// rather than falling back to cookie auth — a stale or revoked
		// token is a bug the caller needs to see, not silently downgrade.
		return new Response(JSON.stringify({ message: 'unauthorized', error: 'unauthorized' }), {
			status: 401,
			headers: { 'content-type': 'application/json' }
		});
	}

	const sid = event.cookies.get(SESSION_COOKIE);
	const authed = await validateSession(sid);
	event.locals.authed = authed;

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
}

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
