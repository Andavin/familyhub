import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { tasks } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { nextOccurrence } from '$lib/server/recurrence';

/**
 * Toggle complete. If the task is recurring AND we are completing (not un-completing),
 * we leave the original task as completed and spawn the next occurrence as a new pending task.
 * This mirrors how Apple Reminders handles repeating reminders (history is preserved).
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as { completedById?: number | null };

	const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
	if (!task) throw error(404, 'not found');

	if (task.completedAt) {
		// un-complete
		const [row] = await db
			.update(tasks)
			.set({ completedAt: null, completedBy: null, updatedAt: new Date() })
			.where(eq(tasks.id, id))
			.returning();
		return json({ task: row });
	}

	const now = new Date();
	const [row] = await db
		.update(tasks)
		.set({
			completedAt: now,
			completedBy: body.completedById ?? null,
			updatedAt: now
		})
		.where(eq(tasks.id, id))
		.returning();

	let spawned = null;
	if (task.rrule) {
		const next = nextOccurrence(task.rrule, task.dueAt ?? now);
		if (next) {
			[spawned] = await db
				.insert(tasks)
				.values({
					listId: task.listId,
					assigneeId: task.assigneeId,
					title: task.title,
					notes: task.notes,
					dueAt: next,
					rrule: task.rrule,
					flagged: task.flagged
				})
				.returning();
		}
	}

	return json({ task: row, next: spawned });
};
