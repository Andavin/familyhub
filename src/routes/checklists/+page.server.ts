import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { checklists, users, lists } from '$lib/server/schema';
import { asc, eq } from 'drizzle-orm';
import { getOrCreateInbox } from '$lib/server/inbox';
import { listTags, loadChecklistTagMap } from '$lib/server/tags';
import { dep } from '$lib/channels';

export const load: PageServerLoad = async ({ depends }) => {
	depends(dep('checklists'), dep('users'), dep('lists'), dep('tags'));
	await getOrCreateInbox();
	const [cl, u, ls, tags, checklistTags] = await Promise.all([
		db.select().from(checklists),
		db.select().from(users).orderBy(asc(users.displayOrder)),
		db
			.select()
			.from(lists)
			.where(eq(lists.kind, 'chores'))
			.orderBy(asc(lists.displayOrder)),
		listTags('task'),
		loadChecklistTagMap()
	]);
	return { checklists: cl, users: u, lists: ls, tags, checklistTags };
};
