import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { checklists, users } from '$lib/server/schema';
import { asc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const [cl, u] = await Promise.all([
		db.select().from(checklists),
		db.select().from(users).orderBy(asc(users.displayOrder))
	]);
	return { checklists: cl, users: u };
};
