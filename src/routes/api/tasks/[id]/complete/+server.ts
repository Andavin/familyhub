import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { tasks, taskCompletions } from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';
import { nextOccurrence } from '$lib/server/recurrence';

/**
 * Toggle complete with Apple-Reminders-style recurring semantics.
 *
 * Non-recurring task:
 *   - complete: set tasks.completedAt = now
 *   - uncomplete: clear tasks.completedAt
 *
 * Recurring task with remaining occurrences:
 *   - complete: append a task_completions row capturing completedAt and the
 *     current dueAt; advance tasks.dueAt to the next occurrence. The task
 *     row itself stays active (completedAt = null).
 *   - uncomplete: rewind tasks.dueAt to the most recent completion's
 *     dueAtAtCompletion and delete that completion row.
 *
 * Recurring task with no more occurrences (e.g. RRULE COUNT=N exhausted):
 *   - complete: log the completion AND set tasks.completedAt = now (the
 *     series is now done).
 *   - uncomplete: rewind dueAt + clear completedAt.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as { completedById?: number | null };
	const completedBy = body.completedById ?? null;

	const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
	if (!task) throw error(404, 'not found');

	const isCurrentlyDone = !!task.completedAt;
	const [latestCompletion] = await db
		.select()
		.from(taskCompletions)
		.where(eq(taskCompletions.taskId, id))
		.orderBy(desc(taskCompletions.completedAt))
		.limit(1);

	// === UNCOMPLETE ===
	// Treat as "uncomplete" if either the row is marked done OR (recurring) we
	// have a completion log to rewind from.
	if (isCurrentlyDone || latestCompletion) {
		const update: Record<string, unknown> = { updatedAt: new Date() };
		if (latestCompletion) {
			update.dueAt = latestCompletion.dueAtAtCompletion;
			await db.delete(taskCompletions).where(eq(taskCompletions.id, latestCompletion.id));
		}
		if (isCurrentlyDone) {
			update.completedAt = null;
			update.completedBy = null;
		}
		const [row] = await db.update(tasks).set(update).where(eq(tasks.id, id)).returning();
		return json({ task: row });
	}

	// === COMPLETE ===
	const now = new Date();

	if (task.rrule) {
		const next = nextOccurrence(task.rrule, task.dueAt ?? now);
		await db.insert(taskCompletions).values({
			taskId: task.id,
			completedAt: now,
			completedBy,
			dueAtAtCompletion: task.dueAt
		});
		const update: Record<string, unknown> = { updatedAt: now };
		if (next) {
			update.dueAt = next;
		} else {
			// Series is exhausted — mark the row complete in addition to logging.
			update.completedAt = now;
			update.completedBy = completedBy;
		}
		const [row] = await db.update(tasks).set(update).where(eq(tasks.id, id)).returning();
		return json({ task: row });
	}

	// Non-recurring: just set completedAt on the row.
	const [row] = await db
		.update(tasks)
		.set({ completedAt: now, completedBy, updatedAt: now })
		.where(eq(tasks.id, id))
		.returning();
	return json({ task: row });
};
