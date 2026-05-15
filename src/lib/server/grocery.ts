import { db } from './db';
import { groceryItems, groceryPurchases, type GroceryItem } from './schema';
import { and, desc, eq, gt, isNotNull, lt, sql } from 'drizzle-orm';

/**
 * Single source of truth for the "treat a check-off as undoable" window.
 * If a user unchecks within this window, we delete the purchase row and
 * flip the item back as if it never happened. Past the window:
 * - the lazy sweep purges the source item row
 * - re-adding by name creates a fresh item (and a future purchase row)
 *   rather than reviving the old one
 */
export const PURCHASE_UNDO_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * Drop checked-off item rows whose `lastPurchasedAt` is older than the
 * undo window. The purchase history rows stay; only the live item rows
 * get cleared so the active list doesn't accumulate strikethrough
 * detritus.
 *
 * Called opportunistically on page load — no scheduled job.
 */
export async function purgeStalePurchasedItems(now = Date.now()): Promise<void> {
	const cutoff = new Date(now - PURCHASE_UNDO_WINDOW_MS);
	await db
		.delete(groceryItems)
		.where(and(isNotNull(groceryItems.lastPurchasedAt), lt(groceryItems.lastPurchasedAt, cutoff)));
}

/**
 * Mark an item purchased: set `lastPurchasedAt` and snapshot the buy
 * into `grocery_purchases` for long-term history.
 */
export async function markPurchased(
	itemId: number,
	purchasedById: number | null = null,
	now = Date.now()
): Promise<GroceryItem | null> {
	const [item] = await db
		.select()
		.from(groceryItems)
		.where(eq(groceryItems.id, itemId))
		.limit(1);
	if (!item) return null;
	const stamp = new Date(now);
	const [updated] = await db
		.update(groceryItems)
		.set({ lastPurchasedAt: stamp })
		.where(eq(groceryItems.id, itemId))
		.returning();
	await db.insert(groceryPurchases).values({
		groceryItemId: item.id,
		nameSnapshot: item.name,
		storeId: item.storeId,
		amount: item.amount,
		purchasedAt: stamp,
		purchasedById
	});
	return updated ?? null;
}

/**
 * Within the undo window: clear `lastPurchasedAt` and delete the most
 * recent purchase row for this item — treat the check-off as never
 * having happened. Past the window the row is already swept; this is a
 * no-op safety.
 */
export async function undoPurchase(
	itemId: number,
	now = Date.now()
): Promise<GroceryItem | null> {
	const [item] = await db
		.select()
		.from(groceryItems)
		.where(eq(groceryItems.id, itemId))
		.limit(1);
	if (!item || !item.lastPurchasedAt) return item ?? null;
	const cutoff = new Date(now - PURCHASE_UNDO_WINDOW_MS);
	if (item.lastPurchasedAt < cutoff) return item;
	const [latest] = await db
		.select({ id: groceryPurchases.id })
		.from(groceryPurchases)
		.where(eq(groceryPurchases.groceryItemId, itemId))
		.orderBy(desc(groceryPurchases.purchasedAt))
		.limit(1);
	if (latest) {
		await db.delete(groceryPurchases).where(eq(groceryPurchases.id, latest.id));
	}
	const [updated] = await db
		.update(groceryItems)
		.set({ lastPurchasedAt: null })
		.where(eq(groceryItems.id, itemId))
		.returning();
	return updated ?? null;
}

/**
 * If a same-name item is checked within the undo window, flip it back
 * instead of creating a duplicate row. Otherwise INSERT a new item.
 * Match is case-insensitive on trimmed name.
 *
 * Returns `{ item, flipped }` so callers can react (e.g. UI feedback).
 */
export async function addOrFlipItem(
	name: string,
	opts: {
		storeId?: number | null;
		amount?: number;
		addedById?: number | null;
	} = {},
	now = Date.now()
): Promise<{ item: GroceryItem; flipped: boolean } | null> {
	const trimmed = name.trim();
	if (!trimmed) return null;
	const cutoff = new Date(now - PURCHASE_UNDO_WINDOW_MS);
	const [match] = await db
		.select()
		.from(groceryItems)
		.where(
			and(
				sql`lower(${groceryItems.name}) = lower(${trimmed})`,
				isNotNull(groceryItems.lastPurchasedAt),
				gt(groceryItems.lastPurchasedAt, cutoff)
			)
		)
		.limit(1);
	if (match) {
		const [latest] = await db
			.select({ id: groceryPurchases.id })
			.from(groceryPurchases)
			.where(eq(groceryPurchases.groceryItemId, match.id))
			.orderBy(desc(groceryPurchases.purchasedAt))
			.limit(1);
		if (latest) {
			await db.delete(groceryPurchases).where(eq(groceryPurchases.id, latest.id));
		}
		const [flipped] = await db
			.update(groceryItems)
			.set({ lastPurchasedAt: null })
			.where(eq(groceryItems.id, match.id))
			.returning();
		return flipped ? { item: flipped, flipped: true } : null;
	}
	const [created] = await db
		.insert(groceryItems)
		.values({
			name: trimmed,
			storeId: opts.storeId ?? null,
			amount: opts.amount ?? 1,
			addedById: opts.addedById ?? null
		})
		.returning();
	return created ? { item: created, flipped: false } : null;
}

export type RecentPurchase = {
	id: number;
	groceryItemId: number | null;
	nameSnapshot: string;
	storeId: number | null;
	amount: number;
	purchasedAt: Date;
};

/**
 * Most-recent purchase per name within the last `days` days. Deduped in
 * JS — the set is small (one row per distinct grocery you've ever
 * bought, capped to the window).
 */
export async function recentPurchases(
	days = 30,
	now = Date.now()
): Promise<RecentPurchase[]> {
	const cutoff = new Date(now - days * 86_400_000);
	const rows = await db
		.select()
		.from(groceryPurchases)
		.where(gt(groceryPurchases.purchasedAt, cutoff))
		.orderBy(desc(groceryPurchases.purchasedAt));
	const seen = new Set<string>();
	const out: RecentPurchase[] = [];
	for (const r of rows) {
		const key = r.nameSnapshot.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({
			id: r.id,
			groceryItemId: r.groceryItemId,
			nameSnapshot: r.nameSnapshot,
			storeId: r.storeId,
			amount: r.amount,
			purchasedAt: r.purchasedAt
		});
	}
	return out;
}

/**
 * Add a fresh item from a historical purchase. Always creates a new
 * row (the undo path handles the ≤4h case before this is called).
 * Snapshot fields seed the new item; tags don't carry over (history
 * rows don't snapshot them).
 */
export async function reAddFromPurchase(
	purchaseId: number,
	addedById: number | null = null
): Promise<GroceryItem | null> {
	const [p] = await db
		.select()
		.from(groceryPurchases)
		.where(eq(groceryPurchases.id, purchaseId))
		.limit(1);
	if (!p) return null;
	const [created] = await db
		.insert(groceryItems)
		.values({
			name: p.nameSnapshot,
			storeId: p.storeId,
			amount: p.amount,
			addedById
		})
		.returning();
	return created ?? null;
}
