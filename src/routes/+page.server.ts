import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users, lists, tasks, checklists } from '$lib/server/schema';
import { asc, desc, isNull, isNotNull, eq, and, gte } from 'drizzle-orm';
import { getOrCreateInbox } from '$lib/server/inbox';

export const load: PageServerLoad = async () => {
	// Make sure the inbox exists before we read lists.
	await getOrCreateInbox();

	// Show completed within the last 30 days; older completes drop off automatically.
	const cutoff = new Date(Date.now() - 30 * 86_400_000);

	const [u, l, openTasks, doneTasks, tmpl] = await Promise.all([
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
		db
			.select()
			.from(tasks)
			.where(and(isNotNull(tasks.completedAt), gte(tasks.completedAt, cutoff)))
			.orderBy(desc(tasks.completedAt)),
		db.select().from(checklists)
	]);

	return { users: u, lists: l, openTasks, doneTasks, checklists: tmpl };
};
