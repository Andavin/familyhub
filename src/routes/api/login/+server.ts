import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	SESSION_COOKIE,
	checkLoginRateLimit,
	clearLoginFailures,
	createSession,
	deleteSession,
	familyPassword,
	recordLoginFailure
} from '$lib/server/auth';
import { apiError } from '$lib/server/api-error';
import { timingSafeEqual } from 'node:crypto';

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const ip = getClientAddress();
	const limit = checkLoginRateLimit(ip);
	if (!limit.allowed) {
		return json(
			{ error: 'too many attempts, try again later' },
			{ status: 429, headers: { 'retry-after': String(limit.retryAfterSec) } }
		);
	}

	const body = (await request.json().catch(() => ({}))) as { password?: string };
	if (!body.password || !safeEqual(body.password, familyPassword())) {
		recordLoginFailure(ip);
		apiError(401, 'invalid password');
	}
	clearLoginFailures(ip);

	const sid = await createSession();
	cookies.set(SESSION_COOKIE, sid, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		// Set when running under NODE_ENV=production — typically that
		// means a TLS-terminating reverse proxy is in front, so the
		// browser-facing connection is HTTPS even though the app itself
		// only sees plain HTTP from the proxy. Marking the cookie
		// secure ensures the browser won't send it back over plain HTTP.
		secure: process.env.NODE_ENV === 'production',
		maxAge: 60 * 86400
	});
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ cookies }) => {
	const sid = cookies.get(SESSION_COOKIE);
	if (sid) await deleteSession(sid);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	return json({ ok: true });
};
