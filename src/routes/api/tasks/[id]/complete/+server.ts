import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { tasks, taskCompletions } from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';
import { nextOccurrence } from '$lib/server/recurrence';
import { apiError } from '$lib/server/api-error';

/**
 * Apple-Reminders-style complete/uncomplete.
 *
 * The caller MUST send `{ action: "complete" | "uncomplete" }`. Without it
 * the server has no way to distinguish "tap the empty circle on the next
 * scheduled occurrence" (advance + log) from "tap the filled circle in the
 * Completed section" (rewind to the prior completion). Both targets are the
 * same task id with the same state on the row, so we rely on the UI's
 * intent.
 *
 * Non-recurring task:
 *   - complete:   set tasks.completedAt = now
 *   - uncomplete: clear tasks.completedAt
 *
 * Recurring task:
 *   - complete:   log a task_completions row capturing the current dueAt,
 *                 then advance tasks.dueAt to the next occurrence. If the
 *                 series is exhausted, also set tasks.completedAt.
 *   - uncomplete: rewind tasks.dueAt to the most recent completion's
 *                 dueAtAtCompletion and delete that log row. If the row was
 *                 also marked done (series-end), clear completedAt too.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as {
		action?: 'complete' | 'uncomplete';
		completedById?: number | null;
	};
	if (body.action !== 'complete' && body.action !== 'uncomplete') {
		apiError(400, 'action must be "complete" or "uncomplete"');
	}

	const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
	if (!task) apiError(404, 'not found');

	// If the caller didn't say who completed it, default to the task's
	// assignee. The kiosk UI sends an explicit `completedById` for
	// unassigned tasks (via a who-did-it picker); for assigned tasks the
	// assignee is the obvious answer, so we don't force the UI to repeat
	// itself.
	const completedBy =
		body.completedById !== undefined ? body.completedById : task.assigneeId;

	if (body.action === 'uncomplete') {
		const [latestCompletion] = await db
			.select()
			.from(taskCompletions)
			.where(eq(taskCompletions.taskId, id))
			.orderBy(desc(taskCompletions.completedAt))
			.limit(1);

		const update: Record<string, unknown> = { updatedAt: new Date() };
		if (latestCompletion) {
			update.dueAt = latestCompletion.dueAtAtCompletion;
			await db.delete(taskCompletions).where(eq(taskCompletions.id, latestCompletion.id));
		}
		if (task.completedAt) {
			update.completedAt = null;
			update.completedBy = null;
		}
		const [row] = await db.update(tasks).set(update).where(eq(tasks.id, id)).returning();
		return json(row);
	}

	// === COMPLETE ===
	const now = new Date();

	if (task.rrule) {
		// `recurFromCompletion` makes "every N days" mean "N days from when
		// I actually did it" — anchor at `now` instead of the prior schedule
		// so completing late shifts the whole cadence forward.
		const anchor = task.recurFromCompletion ? now : task.dueAt ?? now;
		const next = nextOccurrence(task.rrule, anchor);
		await db.insert(taskCompletions).values({
			taskId: task.id,
			seriesIdSnapshot: task.id,
			titleSnapshot: task.title,
			listIdSnapshot: task.listId,
			completedAt: now,
			completedBy,
			dueAtAtCompletion: task.dueAt
		});
		const update: Record<string, unknown> = { updatedAt: now };
		if (next) {
			update.dueAt = next;
		} else {
			update.completedAt = now;
			update.completedBy = completedBy;
		}
		const [row] = await db.update(tasks).set(update).where(eq(tasks.id, id)).returning();
		return json(row);
	}

	const [row] = await db
		.update(tasks)
		.set({ completedAt: now, completedBy, updatedAt: now })
		.where(eq(tasks.id, id))
		.returning();
	return json(row);
};
