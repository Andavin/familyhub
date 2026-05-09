import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users, calendarFeeds } from '$lib/server/schema';
import { asc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const [u, f] = await Promise.all([
		db.select().from(users).orderBy(asc(users.displayOrder)),
		db.select().from(calendarFeeds).orderBy(asc(calendarFeeds.id))
	]);
	return { users: u, feeds: f };
};
