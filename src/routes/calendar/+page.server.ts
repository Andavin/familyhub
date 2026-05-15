import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { tasks, users, lists, calendarFeeds } from '$lib/server/schema';
import { and, asc, isNotNull, isNull } from 'drizzle-orm';
import { fetchIcsFeed, expandEvents, type CalEvent } from '$lib/server/ics';
import { futureOccurrences } from '$lib/server/recurrence';
import { loadDoneEntries } from '$lib/server/done';
import { listTags, loadTaskTagMap } from '$lib/server/tags';

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

	const gridStart = new Date(start);
	gridStart.setDate(start.getDate() - start.getDay());
	const gridEnd = new Date(end);
	gridEnd.setDate(end.getDate() + (6 - end.getDay()));

	const [u, l, activeDueTasks, doneEntries, feeds, tags, taskTags] = await Promise.all([
		db.select().from(users).orderBy(asc(users.displayOrder)),
		db.select().from(lists),
		db
			.select()
			.from(tasks)
			.where(and(isNotNull(tasks.dueAt), isNull(tasks.completedAt)))
			.orderBy(asc(tasks.dueAt)),
		loadDoneEntries(gridStart),
		db.select().from(calendarFeeds).orderBy(asc(calendarFeeds.id)),
		listTags('task'),
		loadTaskTagMap()
	]);

	// Fetch every feed in parallel, then expand recurring events into per-
	// occurrence entries within the visible grid. Bad feeds return [] so a
	// single broken URL never breaks the page.
	const events: (CalEvent & { feedId: number; userId: number | null })[] = [];
	const feedFetches = await Promise.all(
		feeds.map((f) =>
			fetchIcsFeed(f.url, f.name, f.color).then((raw) =>
				expandEvents(raw, gridStart, gridEnd)
					.filter(
						(e) => e.start.getTime() < gridEnd.getTime() && e.end.getTime() > gridStart.getTime()
					)
					.map((e) => ({ ...e, feedId: f.id, userId: f.userId }))
			)
		)
	);
	for (const arr of feedFetches) events.push(...arr);

	const ghosts: GhostOccurrence[] = [];
	const usersById = new Map(u.map((x) => [x.id, x]));
	for (const t of activeDueTasks) {
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
		tasks: activeDueTasks,
		doneEntries,
		ghosts,
		events,
		feeds,
		tags,
		taskTags,
		month: { year: ref.getFullYear(), month: ref.getMonth() }
	};
};
