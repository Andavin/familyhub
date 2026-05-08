import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users, lists, tasks, templates } from '$lib/server/schema';
import { asc, isNull } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const [u, l, t, tmpl] = await Promise.all([
		db.select().from(users).orderBy(asc(users.displayOrder)),
		db.select().from(lists).orderBy(asc(lists.displayOrder)),
		db
			.select()
			.from(tasks)
			.where(isNull(tasks.completedAt))
			.orderBy(asc(tasks.sortOrder), asc(tasks.createdAt)),
		db.select().from(templates)
	]);
	return { users: u, lists: l, tasks: t, templates: tmpl };
};
