import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { groceryItems } from '$lib/server/schema';
import { asc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const items = await db.select().from(groceryItems).orderBy(asc(groceryItems.createdAt));
	return { items };
};
