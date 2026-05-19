import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users, calendarFeeds, lists, apiKeys } from '$lib/server/schema';
import { asc, desc, isNull } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const [u, f, l, k] = await Promise.all([
		db.select().from(users).orderBy(asc(users.displayOrder)),
		db.select().from(calendarFeeds).orderBy(asc(calendarFeeds.id)),
		db.select().from(lists),
		db
			.select({
				id: apiKeys.id,
				name: apiKeys.name,
				prefix: apiKeys.prefix,
				userId: apiKeys.userId,
				createdAt: apiKeys.createdAt,
				lastUsedAt: apiKeys.lastUsedAt
			})
			.from(apiKeys)
			.where(isNull(apiKeys.revokedAt))
			.orderBy(desc(apiKeys.createdAt), asc(apiKeys.id))
	]);
	return { users: u, feeds: f, lists: l, apiKeys: k };
};
