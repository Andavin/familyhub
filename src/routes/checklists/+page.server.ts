import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { checklists, users, lists } from '$lib/server/schema';
import { asc, eq } from 'drizzle-orm';
import { getOrCreateInbox } from '$lib/server/inbox';

export const load: PageServerLoad = async () => {
	await getOrCreateInbox();
	const [cl, u, ls] = await Promise.all([
		db.select().from(checklists),
		db.select().from(users).orderBy(asc(users.displayOrder)),
		db
			.select()
			.from(lists)
			.where(eq(lists.kind, 'chores'))
			.orderBy(asc(lists.displayOrder))
	]);
	return { checklists: cl, users: u, lists: ls };
};
