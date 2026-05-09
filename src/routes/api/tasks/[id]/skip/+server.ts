import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { tasks } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { nextOccurrence } from '$lib/server/recurrence';

/**
 * Skip the current occurrence of a recurring task without logging a
 * completion. Advances dueAt to the next occurrence per the task's rrule.
 * If the rule has no next occurrence (e.g. COUNT exhausted), deletes the
 * task entirely — there's nothing left to do.
 *
 * For non-recurring tasks this endpoint is a no-op (returns 400).
 */
export const POST: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');

	const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
	if (!task) throw error(404, 'not found');
	if (!task.rrule) throw error(400, 'task is not recurring');

	const next = nextOccurrence(task.rrule, task.dueAt ?? new Date());
	if (!next) {
		await db.delete(tasks).where(eq(tasks.id, id));
		return json({ deleted: true });
	}

	const [row] = await db
		.update(tasks)
		.set({ dueAt: next, updatedAt: new Date() })
		.where(eq(tasks.id, id))
		.returning();
	return json({ task: row });
};
