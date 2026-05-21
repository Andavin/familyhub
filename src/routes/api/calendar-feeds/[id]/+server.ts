import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { calendarFeeds } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { clearIcsCache } from '$lib/server/ics';
import { validateFeedUrl } from '$lib/server/url-allowlist';
import { apiError } from '$lib/server/api-error';
import { broadcast } from '$lib/server/events';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as Partial<{
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
		if (typeof body.url !== 'string') apiError(400, 'url must be a string');
		const v = validateFeedUrl(body.url.trim());
		if (!v.ok) apiError(400, v.reason);
		update.url = v.url.toString();
	}
	if ('color' in body) update.color = body.color;
	if ('userId' in body) update.userId = body.userId;
	const [row] = await db
		.update(calendarFeeds)
		.set(update)
		.where(eq(calendarFeeds.id, id))
		.returning();
	if (!row) apiError(404, 'not found');
	if ('url' in body) clearIcsCache();
	broadcast('feeds');
	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	await db.delete(calendarFeeds).where(eq(calendarFeeds.id, id));
	broadcast('feeds');
	return json({ ok: true });
};
