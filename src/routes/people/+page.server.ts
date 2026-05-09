import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users, calendarFeeds, lists } from '$lib/server/schema';
import { asc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const [u, f, l] = await Promise.all([
		db.select().from(users).orderBy(asc(users.displayOrder)),
		db.select().from(calendarFeeds).orderBy(asc(calendarFeeds.id)),
		db.select().from(lists)
	]);
	return { users: u, feeds: f, lists: l };
};
