import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { tasks, users, lists } from '$lib/server/schema';
import { asc, isNotNull } from 'drizzle-orm';
import { fetchEvents } from '$lib/server/caldav';

export const load: PageServerLoad = async ({ url }) => {
	const monthParam = url.searchParams.get('month');
	const today = new Date();
	const ref = monthParam ? new Date(monthParam + '-01T00:00:00') : today;
	const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
	const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);

	// pad to start on Sunday
	const gridStart = new Date(start);
	gridStart.setDate(start.getDate() - start.getDay());
	const gridEnd = new Date(end);
	gridEnd.setDate(end.getDate() + (6 - end.getDay()));

	const [u, l, dueTasks, events] = await Promise.all([
		db.select().from(users).orderBy(asc(users.displayOrder)),
		db.select().from(lists),
		db.select().from(tasks).where(isNotNull(tasks.dueAt)).orderBy(asc(tasks.dueAt)),
		fetchEvents(gridStart, gridEnd)
	]);

	return {
		users: u,
		lists: l,
		tasks: dueTasks,
		events,
		month: { year: ref.getFullYear(), month: ref.getMonth() }
	};
};
