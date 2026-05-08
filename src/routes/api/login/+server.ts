import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE, createSession, deleteSession, familyPassword } from '$lib/server/auth';
import { timingSafeEqual } from 'node:crypto';

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = (await request.json().catch(() => ({}))) as { password?: string };
	if (!body.password || !safeEqual(body.password, familyPassword())) {
		return json({ error: 'invalid password' }, { status: 401 });
	}
	const sid = await createSession();
	cookies.set(SESSION_COOKIE, sid, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: false,
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
