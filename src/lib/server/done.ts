/**
 * Merge non-recurring completed tasks with recurring-task completion records
 * into a single list of "done entries" for display in Completed sections.
 *
 * Non-recurring: tasks where completedAt is set. We render the row directly.
 * Recurring: each entry in task_completions becomes its own row, with the
 *   underlying task's title/notes/etc. but completedAt overridden to the
 *   completion's timestamp and dueAt set to dueAtAtCompletion. This lets a
 *   recurring task show every time it was checked off, like Apple Reminders.
 *
 * Each entry has a stable `uid` for keyed rendering: 't<taskId>' for
 * non-recurring rows, 'c<completionId>' for completion records.
 */
import { db } from './db';
import { tasks, taskCompletions, type Task } from './schema';
import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';

export type DoneEntry = {
	uid: string;
	task: Task; // synthesized: completedAt + dueAt may be overridden for completion records
	completionId?: number;
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
			.innerJoin(tasks, eq(taskCompletions.taskId, tasks.id))
			.where(gte(taskCompletions.completedAt, since))
			.orderBy(desc(taskCompletions.completedAt))
	]);

	const entries: DoneEntry[] = [];

	for (const t of completedTasks) {
		entries.push({ uid: 't' + t.id, task: t });
	}

	for (const { completion, task } of completionRows) {
		entries.push({
			uid: 'c' + completion.id,
			task: {
				...task,
				completedAt: completion.completedAt,
				completedBy: completion.completedBy,
				dueAt: completion.dueAtAtCompletion ?? task.dueAt
			},
			completionId: completion.id
		});
	}

	entries.sort(
		(a, b) =>
			(b.task.completedAt as Date).getTime() - (a.task.completedAt as Date).getTime()
	);

	return entries;
}
