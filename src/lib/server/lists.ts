import { db } from './db';
import { lists } from './schema';
import { eq } from 'drizzle-orm';

/**
 * Re-stamp `displayOrder` from an ordered list of IDs. Mirrors the stores
 * reorder pattern. The inbox is reorderable along with user lists — its
 * `system='inbox'` marker is only for delete protection and picker
 * exclusion, not for pinning a position.
 *
 * IDs not in `lists` are silently dropped. Wrapped in a transaction so a
 * partial reorder can't leave the rows in a half-renumbered state on crash.
 */
export async function reorderLists(orderedIds: number[]): Promise<void> {
	db.transaction((tx) => {
		for (let i = 0; i < orderedIds.length; i++) {
			tx.update(lists).set({ displayOrder: i }).where(eq(lists.id, orderedIds[i])).run();
		}
	});
}
