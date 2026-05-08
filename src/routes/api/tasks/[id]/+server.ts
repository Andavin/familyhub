import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { tasks } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	const body = (await request.json()) as Partial<{
		title: string;
		notes: string | null;
		assigneeId: number | null;
		listId: number;
		dueAt: string | null;
		dueHasTime: boolean;
		rrule: string | null;
		flagged: boolean;
		priority: number;
		sortOrder: number;
	}>;

	const update: Record<string, unknown> = { updatedAt: new Date() };
	if ('title' in body) update.title = body.title;
	if ('notes' in body) update.notes = body.notes;
	if ('assigneeId' in body) update.assigneeId = body.assigneeId;
	if ('listId' in body) update.listId = body.listId;
	if ('dueAt' in body) update.dueAt = body.dueAt ? new Date(body.dueAt) : null;
	if ('dueHasTime' in body) update.dueHasTime = body.dueHasTime;
	if ('rrule' in body) update.rrule = body.rrule;
	if ('flagged' in body) update.flagged = body.flagged;
	if ('priority' in body) update.priority = body.priority;
	if ('sortOrder' in body) update.sortOrder = body.sortOrder;

	const [row] = await db.update(tasks).set(update).where(eq(tasks.id, id)).returning();
	if (!row) throw error(404, 'not found');
	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	await db.delete(tasks).where(eq(tasks.id, id));
	return json({ ok: true });
};
