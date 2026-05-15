import { db } from './db';
import { groceryItems, groceryPurchases, type GroceryItem } from './schema';
import { and, desc, eq, gt, isNotNull, isNull, lt, sql } from 'drizzle-orm';

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

export type AddItemMode = 'created' | 'merged' | 'flipped';
export type AddItemResult = { item: GroceryItem; mode: AddItemMode };

/**
 * Three-way add: same name + same store on the active list bumps the
 * existing item's amount; same name on a recently-purchased row flips
 * it back to active (the "I changed my mind" path within the undo
 * window); otherwise INSERT a fresh row. Match is case-insensitive on
 * trimmed name.
 *
 * Active-merge wins over flip-back when both could apply — buying
 * three of something you already have on the list is the more common
 * intent than reviving a duplicate.
 */
export async function addOrFlipItem(
	name: string,
	opts: {
		storeId?: number | null;
		amount?: number;
		addedById?: number | null;
	} = {},
	now = Date.now()
): Promise<AddItemResult | null> {
	const trimmed = name.trim();
	if (!trimmed) return null;
	const addAmount = Math.max(1, Math.floor(opts.amount ?? 1));
	const storeId = opts.storeId ?? null;

	// Active-list dedup: same name + same store (including both-null)
	// bumps the existing row's amount instead of creating a duplicate.
	const storeMatch =
		storeId == null
			? isNull(groceryItems.storeId)
			: eq(groceryItems.storeId, storeId);
	const [active] = await db
		.select()
		.from(groceryItems)
		.where(
			and(
				sql`lower(${groceryItems.name}) = lower(${trimmed})`,
				isNull(groceryItems.lastPurchasedAt),
				storeMatch
			)
		)
		.limit(1);
	if (active) {
		const [merged] = await db
			.update(groceryItems)
			.set({ amount: active.amount + addAmount })
			.where(eq(groceryItems.id, active.id))
			.returning();
		return merged ? { item: merged, mode: 'merged' } : null;
	}

	// Flip-back: same name + same store on a recently-purchased row →
	// revive it. The store match matters here too — buying milk at
	// Costco shouldn't be cancelled by a Super 1 milk add 3h later;
	// those are different items.
	const cutoff = new Date(now - PURCHASE_UNDO_WINDOW_MS);
	const [recent] = await db
		.select()
		.from(groceryItems)
		.where(
			and(
				sql`lower(${groceryItems.name}) = lower(${trimmed})`,
				isNotNull(groceryItems.lastPurchasedAt),
				gt(groceryItems.lastPurchasedAt, cutoff),
				storeMatch
			)
		)
		.limit(1);
	if (recent) {
		const [latest] = await db
			.select({ id: groceryPurchases.id })
			.from(groceryPurchases)
			.where(eq(groceryPurchases.groceryItemId, recent.id))
			.orderBy(desc(groceryPurchases.purchasedAt))
			.limit(1);
		if (latest) {
			await db.delete(groceryPurchases).where(eq(groceryPurchases.id, latest.id));
		}
		const [flipped] = await db
			.update(groceryItems)
			.set({ lastPurchasedAt: null })
			.where(eq(groceryItems.id, recent.id))
			.returning();
		return flipped ? { item: flipped, mode: 'flipped' } : null;
	}

	const [created] = await db
		.insert(groceryItems)
		.values({
			name: trimmed,
			storeId,
			amount: addAmount,
			addedById: opts.addedById ?? null
		})
		.returning();
	return created ? { item: created, mode: 'created' } : null;
}

export type RecentPurchase = {
	id: number;
	groceryItemId: number | null;
	nameSnapshot: string;
	storeId: number | null;
	amount: number;
	purchasedAt: Date;
	/**
	 * True when this purchase is still inside the undo window AND its
	 * source item row hasn't been deleted. The page surfaces an
	 * uncheck-to-restore affordance on undoable entries.
	 */
	undoable: boolean;
};

/**
 * Most-recent purchase per (name, store) within the last `days` days.
 * Same name at different stores stays distinct so the user can re-add
 * the Costco vs Super 1 version of the same product independently.
 * Deduped in JS — the set is small.
 */
export async function recentPurchases(
	days = 30,
	now = Date.now()
): Promise<RecentPurchase[]> {
	const cutoff = new Date(now - days * 86_400_000);
	const undoCutoff = new Date(now - PURCHASE_UNDO_WINDOW_MS);
	const rows = await db
		.select()
		.from(groceryPurchases)
		.where(gt(groceryPurchases.purchasedAt, cutoff))
		.orderBy(desc(groceryPurchases.purchasedAt));
	const seen = new Set<string>();
	const out: RecentPurchase[] = [];
	for (const r of rows) {
		const key = `${r.nameSnapshot.toLowerCase()}|${r.storeId ?? 'unassigned'}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({
			id: r.id,
			groceryItemId: r.groceryItemId,
			nameSnapshot: r.nameSnapshot,
			storeId: r.storeId,
			amount: r.amount,
			purchasedAt: r.purchasedAt,
			undoable: r.groceryItemId != null && r.purchasedAt >= undoCutoff
		});
	}
	return out;
}

/**
 * Re-add an item from a historical purchase. Past the undo window
 * this routes through `addOrFlipItem` so the active-list dedup applies
 * — tapping the same Purchased entry twice bumps the freshly-created
 * row's amount rather than stacking duplicates.
 *
 * The in-window undo path (uncheck instead of re-add) is handled by
 * the regular `PATCH /api/grocery/[id]` with `{ purchased: false }`
 * — it's a different intent.
 */
export async function reAddFromPurchase(
	purchaseId: number,
	addedById: number | null = null
): Promise<AddItemResult | null> {
	const [p] = await db
		.select()
		.from(groceryPurchases)
		.where(eq(groceryPurchases.id, purchaseId))
		.limit(1);
	if (!p) return null;
	return addOrFlipItem(
		p.nameSnapshot,
		{
			storeId: p.storeId,
			amount: p.amount,
			addedById
		}
	);
}
