import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { tasks, users, lists } from '$lib/server/schema';
import { asc, isNotNull } from 'drizzle-orm';
import { fetchEvents } from '$lib/server/caldav';
import { futureOccurrences } from '$lib/server/recurrence';

export type GhostOccurrence = {
	taskId: number;
	title: string;
	color: string;
	at: number; // ms
};

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

	// Project future occurrences of recurring tasks into the visible grid.
	const ghosts: GhostOccurrence[] = [];
	const usersById = new Map(u.map((x) => [x.id, x]));
	for (const t of dueTasks) {
		if (!t.rrule || !t.dueAt) continue;
		const occurrences = futureOccurrences(
			t.rrule,
			new Date(t.dueAt),
			gridStart,
			gridEnd
		);
		const userColor = usersById.get(t.assigneeId ?? -1)?.color ?? 'orange';
		for (const at of occurrences) {
			ghosts.push({ taskId: t.id, title: t.title, color: userColor, at: at.getTime() });
		}
	}

	return {
		users: u,
		lists: l,
		tasks: dueTasks,
		ghosts,
		events,
		month: { year: ref.getFullYear(), month: ref.getMonth() }
	};
};
