import { db } from './db';
import { stores, type Store } from './schema';
import { asc, eq } from 'drizzle-orm';

export async function listStores(): Promise<Store[]> {
	return db
		.select()
		.from(stores)
		.orderBy(asc(stores.displayOrder), asc(stores.id));
}

export async function createStore(
	name: string,
	opts: { emoji?: string; color?: string } = {}
): Promise<Store | null> {
	const trimmed = name.trim();
	if (!trimmed) return null;
	const existing = await db
		.select({ max: stores.displayOrder })
		.from(stores)
		.orderBy(asc(stores.displayOrder));
	const next = existing.reduce((m, r) => Math.max(m, r.max ?? 0), -1) + 1;
	const [row] = await db
		.insert(stores)
		.values({
			name: trimmed,
			emoji: opts.emoji?.trim() || '🛒',
			color: opts.color || 'blue',
			displayOrder: next
		})
		.returning();
	return row;
}

export async function updateStore(
	id: number,
	patch: { name?: string; emoji?: string; color?: string }
): Promise<Store | null> {
	const update: Partial<Store> = {};
	if (patch.name !== undefined) {
		const trimmed = patch.name.trim();
		if (!trimmed) return null;
		update.name = trimmed;
	}
	if (patch.emoji !== undefined) update.emoji = patch.emoji.trim() || '🛒';
	if (patch.color !== undefined) update.color = patch.color;
	if (Object.keys(update).length === 0) {
		const [row] = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
		return row ?? null;
	}
	const [row] = await db.update(stores).set(update).where(eq(stores.id, id)).returning();
	return row ?? null;
}

/**
 * Re-stamp `displayOrder` from an ordered list of IDs. IDs not in `stores`
 * are silently dropped. Used by drag-reorder UIs.
 *
 * Wrapped in a transaction so a partial reorder can't leave the list in
 * a half-renumbered state on crash.
 */
export async function reorderStores(orderedIds: number[]): Promise<void> {
	// better-sqlite3 transactions are synchronous — see grocery.ts notes.
	db.transaction((tx) => {
		for (let i = 0; i < orderedIds.length; i++) {
			tx.update(stores).set({ displayOrder: i }).where(eq(stores.id, orderedIds[i])).run();
		}
	});
}

export async function deleteStore(id: number): Promise<void> {
	await db.delete(stores).where(eq(stores.id, id));
}
