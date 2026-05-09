import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { asc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const rows = await db.select().from(users).orderBy(asc(users.displayOrder));
	return { users: rows };
};
