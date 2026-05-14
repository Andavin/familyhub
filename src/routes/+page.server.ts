import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users, lists, tasks, checklists, type Task } from '$lib/server/schema';
import { asc, isNull, eq } from 'drizzle-orm';
import { getOrCreateInbox } from '$lib/server/inbox';
import { loadDoneEntries } from '$lib/server/done';
import { listTags, loadTaskTagMap, loadChecklistTagMap } from '$lib/server/tags';
import { isOverdue } from '$lib/format';
import { nextOccurrenceAfter } from '$lib/server/recurrence';

export const load: PageServerLoad = async () => {
	await getOrCreateInbox();

	// Show completed within the last 30 days; older completes drop off automatically.
	const cutoff = new Date(Date.now() - 30 * 86_400_000);

	const [u, l, openTasks, doneEntries, tmpl, tags, taskTags, checklistTags] = await Promise.all([
		db.select().from(users).orderBy(asc(users.displayOrder)),
		db
			.select()
			.from(lists)
			.where(eq(lists.kind, 'chores'))
			.orderBy(asc(lists.displayOrder)),
		db
			.select()
			.from(tasks)
			.where(isNull(tasks.completedAt))
			.orderBy(asc(tasks.sortOrder), asc(tasks.createdAt)),
		loadDoneEntries(cutoff),
		db.select().from(checklists),
		listTags(),
		loadTaskTagMap(),
		loadChecklistTagMap()
	]);

	// For overdue recurring tasks, project the next-after-now occurrence so
	// the upcoming instance still shows in Scheduled. The actual stored row
	// stays in Today with its overdue flag — this is purely a visual preview.
	// We anchor the rrule at the task's original dueAt so the next instance
	// follows the task's natural schedule (e.g. weekly task originally due
	// last Monday → next is this Monday, not "now + 7d").
	const now = new Date();
	const projectedRecurring: Task[] = [];
	for (const t of openTasks) {
		if (!t.rrule || !t.dueAt) continue;
		if (!isOverdue(new Date(t.dueAt), t.dueHasTime)) continue;
		const next = nextOccurrenceAfter(t.rrule, new Date(t.dueAt), now);
		if (!next) continue;
		projectedRecurring.push({ ...t, dueAt: next });
	}

	return {
		users: u,
		lists: l,
		openTasks,
		projectedRecurring,
		doneEntries,
		checklists: tmpl,
		tags,
		taskTags,
		checklistTags
	};
};
