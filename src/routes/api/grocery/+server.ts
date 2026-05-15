import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { groceryItems } from '$lib/server/schema';
import { asc, isNull } from 'drizzle-orm';
import { addOrFlipItem } from '$lib/server/grocery';

export const GET: RequestHandler = async ({ url }) => {
	const includePurchased = url.searchParams.get('includePurchased') === 'true';
	const where = includePurchased ? undefined : isNull(groceryItems.lastPurchasedAt);
	const rows = await db
		.select()
		.from(groceryItems)
		.where(where)
		.orderBy(asc(groceryItems.createdAt));
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		storeId?: number | null;
		amount?: number;
		addedById?: number | null;
	};
	if (!body.name?.trim()) return json({ error: 'name required' }, { status: 400 });
	const result = await addOrFlipItem(body.name, {
		storeId: body.storeId ?? null,
		amount: body.amount,
		addedById: body.addedById ?? null
	});
	if (!result) throw error(400, 'name required');
	return json(result, { status: result.flipped ? 200 : 201 });
};
