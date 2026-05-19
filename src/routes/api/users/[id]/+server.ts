import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { apiError } from '$lib/server/api-error';
import { broadcast } from '$lib/server/events';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as Partial<{
		name: string;
		color: string;
		emoji: string;
		displayOrder: number;
	}>;
	const update: Record<string, unknown> = {};
	if ('name' in body) update.name = body.name;
	if ('color' in body) update.color = body.color;
	if ('emoji' in body) update.emoji = body.emoji;
	if ('displayOrder' in body) update.displayOrder = body.displayOrder;
	const [row] = await db.update(users).set(update).where(eq(users.id, id)).returning();
	if (!row) apiError(404, 'not found');
	broadcast('users');
	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	await db.delete(users).where(eq(users.id, id));
	// User deletion cascades into lists, tasks, calendar feeds, and
	// per-user API keys via FK onDelete rules, so fan out broadly.
	broadcast('users');
	broadcast('lists');
	broadcast('tasks');
	broadcast('feeds');
	broadcast('api-keys');
	return json({ ok: true });
};
