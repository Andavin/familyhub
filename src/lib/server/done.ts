/**
 * Merge non-recurring completed tasks with recurring-task completion records
 * into a single list of "done entries" for display in Completed sections.
 *
 * Non-recurring: tasks where completedAt is set. Render the row directly.
 * Recurring: each entry in task_completions becomes its own row, using the
 *   underlying task when available and falling back to snapshots when the
 *   parent task has been deleted (history preservation, Apple-style).
 *
 * Each entry has a stable `uid` for keyed rendering ('t<taskId>' for
 * non-recurring, 'c<completionId>' for completion records). `orphan: true`
 * marks a completion whose parent task no longer exists; the UI must
 * disable interaction (uncomplete is meaningless without a task to rewind).
 */
import { db } from './db';
import { tasks, taskCompletions, type Task } from './schema';
import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';

export type DoneEntry = {
	uid: string;
	task: Task; // synthesized — completedAt + dueAt overridden for completion entries
	completionId?: number;
	orphan?: boolean; // true when the parent task has been deleted
};

export async function loadDoneEntries(since: Date): Promise<DoneEntry[]> {
	const [completedTasks, completionRows] = await Promise.all([
		db
			.select()
			.from(tasks)
			.where(and(isNotNull(tasks.completedAt), gte(tasks.completedAt, since)))
			.orderBy(desc(tasks.completedAt)),
		db
			.select({ completion: taskCompletions, task: tasks })
			.from(taskCompletions)
			.leftJoin(tasks, eq(taskCompletions.taskId, tasks.id))
			.where(gte(taskCompletions.completedAt, since))
			.orderBy(desc(taskCompletions.completedAt))
	]);

	const entries: DoneEntry[] = [];

	for (const t of completedTasks) {
		entries.push({ uid: 't' + t.id, task: t });
	}

	for (const { completion, task } of completionRows) {
		if (task) {
			entries.push({
				uid: 'c' + completion.id,
				task: {
					...task,
					completedAt: completion.completedAt,
					completedBy: completion.completedBy,
					dueAt: completion.dueAtCompletion ?? task.dueAt
				},
				completionId: completion.id
			});
		} else {
			// Orphan: parent task has been deleted. Build a synthetic row from
			// the snapshots so the entry still shows in Completed history.
			entries.push({
				uid: 'c' + completion.id,
				task: {
					id: -completion.id,
					listId: completion.listIdSnapshot ?? 0,
					assigneeId: null,
					title: completion.titleSnapshot,
					notes: null,
					dueAt: completion.dueAtCompletion,
					dueHasTime: false,
					rrule: null,
					recurFromCompletion: false,
					priority: 0,
					completedAt: completion.completedAt,
					completedBy: completion.completedBy,
					sortOrder: 0,
					createdAt: completion.completedAt,
					updatedAt: completion.completedAt
				},
				completionId: completion.id,
				orphan: true
			});
		}
	}

	entries.sort(
		(a, b) =>
			(b.task.completedAt as Date).getTime() - (a.task.completedAt as Date).getTime()
	);

	return entries;
}
