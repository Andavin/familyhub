import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { calendarFeeds } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { clearIcsCache } from '$lib/server/ics';
import { validateFeedUrl } from '$lib/server/url-allowlist';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	const body = (await request.json()) as Partial<{
		name: string;
		url: string;
		color: string;
		userId: number | null;
	}>;
	const update: Record<string, unknown> = {};
	if ('name' in body) update.name = body.name?.trim();
	if ('url' in body) {
		// Reject non-string url explicitly — silently skipping it would
		// half-apply a PATCH that the client expected to update the URL.
		if (typeof body.url !== 'string') {
			return json({ error: 'url must be a string' }, { status: 400 });
		}
		const v = validateFeedUrl(body.url.trim());
		if (!v.ok) {
			return json({ error: v.reason }, { status: 400 });
		}
		update.url = v.url.toString();
	}
	if ('color' in body) update.color = body.color;
	if ('userId' in body) update.userId = body.userId;
	const [row] = await db
		.update(calendarFeeds)
		.set(update)
		.where(eq(calendarFeeds.id, id))
		.returning();
	if (!row) throw error(404, 'not found');
	if ('url' in body) clearIcsCache();
	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	await db.delete(calendarFeeds).where(eq(calendarFeeds.id, id));
	return json({ ok: true });
};
