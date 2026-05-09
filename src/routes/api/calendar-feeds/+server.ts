import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { calendarFeeds } from '$lib/server/schema';
import { asc } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
	const rows = await db.select().from(calendarFeeds).orderBy(asc(calendarFeeds.id));
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as {
		name: string;
		url: string;
		color?: string;
		userId?: number | null;
	};
	if (!body.name?.trim() || !body.url?.trim()) {
		return json({ error: 'name and url required' }, { status: 400 });
	}
	const [row] = await db
		.insert(calendarFeeds)
		.values({
			name: body.name.trim(),
			url: body.url.trim(),
			color: body.color ?? 'blue',
			userId: body.userId ?? null
		})
		.returning();
	return json(row, { status: 201 });
};
