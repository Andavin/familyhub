import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { groceryItems } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { markPurchased, undoPurchase } from '$lib/server/grocery';
import { setGroceryItemTags } from '$lib/server/tags';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as Partial<{
		name: string;
		amount: number;
		storeId: number | null;
		purchased: boolean;
		purchasedById: number | null;
		tagIds: number[];
	}>;

	if (body.purchased !== undefined) {
		const row = body.purchased
			? await markPurchased(id, body.purchasedById ?? null)
			: await undoPurchase(id);
		if (!row) throw error(404, 'not found');
		return json(row);
	}

	const update: Partial<typeof groceryItems.$inferInsert> = {};
	if (body.name !== undefined) {
		const trimmed = body.name.trim();
		if (!trimmed) throw error(400, 'name required');
		update.name = trimmed;
	}
	if (body.amount !== undefined) {
		if (!Number.isFinite(body.amount) || body.amount < 1) {
			throw error(400, 'amount must be >= 1');
		}
		update.amount = Math.floor(body.amount);
	}
	if (body.storeId !== undefined) {
		// Defensive coerce: Svelte 5's `bind:value` on a <select> preserves
		// the option's JS value type (so this is already number | null in
		// practice), but the route is a public surface — a direct API
		// caller could pass a string. Accept null, a number, or a numeric
		// string; reject anything else.
		const raw = body.storeId;
		if (raw === null) {
			update.storeId = null;
		} else if (typeof raw === 'number' && Number.isFinite(raw)) {
			update.storeId = raw;
		} else if (typeof raw === 'string' && raw !== '' && Number.isFinite(Number(raw))) {
			update.storeId = Number(raw);
		} else {
			throw error(400, 'storeId must be a number or null');
		}
	}

	let row: typeof groceryItems.$inferSelect | undefined;
	if (Object.keys(update).length > 0) {
		[row] = await db
			.update(groceryItems)
			.set(update)
			.where(eq(groceryItems.id, id))
			.returning();
	} else {
		[row] = await db.select().from(groceryItems).where(eq(groceryItems.id, id)).limit(1);
	}
	if (!row) throw error(404, 'not found');

	if (body.tagIds !== undefined) {
		await setGroceryItemTags(id, body.tagIds);
	}

	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	await db.delete(groceryItems).where(eq(groceryItems.id, id));
	return new Response(null, { status: 204 });
};
