import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { calendarFeeds } from '$lib/server/schema';
import { asc } from 'drizzle-orm';
import { validateFeedUrl } from '$lib/server/url-allowlist';
import { apiError } from '$lib/server/api-error';

export const GET: RequestHandler = async () => {
	const rows = await db.select().from(calendarFeeds).orderBy(asc(calendarFeeds.id));
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		url?: string;
		color?: string;
		userId?: number | null;
	};
	if (!body.name?.trim() || !body.url?.trim()) {
		apiError(400, 'name and url required');
	}
	const v = validateFeedUrl(body.url.trim());
	if (!v.ok) apiError(400, v.reason);
	const [row] = await db
		.insert(calendarFeeds)
		.values({
			name: body.name.trim(),
			url: v.url.toString(),
			color: body.color ?? 'blue',
			userId: body.userId ?? null
		})
		.returning();
	return json(row, { status: 201 });
};
