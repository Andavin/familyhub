import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { templates, users } from '$lib/server/schema';
import { asc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const [tmpl, u] = await Promise.all([
		db.select().from(templates),
		db.select().from(users).orderBy(asc(users.displayOrder))
	]);
	return { templates: tmpl, users: u };
};
