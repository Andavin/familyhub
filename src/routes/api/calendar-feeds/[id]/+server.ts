import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { calendarFeeds } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { clearIcsCache } from '$lib/server/ics';

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
	if ('url' in body) update.url = body.url?.trim();
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
