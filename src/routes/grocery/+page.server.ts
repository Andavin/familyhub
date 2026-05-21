import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { groceryItems } from '$lib/server/schema';
import { asc } from 'drizzle-orm';
import { listStores } from '$lib/server/stores';
import { listTags, loadGroceryItemTagMap } from '$lib/server/tags';
import { purgeStalePurchasedItems, recentPurchases } from '$lib/server/grocery';
import { dep } from '$lib/channels';

export const load: PageServerLoad = async ({ depends }) => {
	depends(dep('grocery'), dep('stores'), dep('tags'));
	// Drop checked rows that have aged past the undo window before we
	// load. Items the user already moved past 4h shouldn't keep showing
	// as strikethrough rows on the active list.
	await purgeStalePurchasedItems();

	const [items, stores, tags, itemTags, recent] = await Promise.all([
		db.select().from(groceryItems).orderBy(asc(groceryItems.createdAt)),
		listStores(),
		listTags('grocery'),
		loadGroceryItemTagMap(),
		recentPurchases(30)
	]);

	return { items, stores, tags, itemTags, recent };
};
