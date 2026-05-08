import type { Handle } from '@sveltejs/kit';
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
