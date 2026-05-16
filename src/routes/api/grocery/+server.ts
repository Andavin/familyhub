import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { groceryItems } from '$lib/server/schema';
import { asc, isNull } from 'drizzle-orm';
import { addOrFlipItem } from '$lib/server/grocery';
import { apiError } from '$lib/server/api-error';

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
	if (!body.name?.trim()) apiError(400, 'name required');
	if (
		body.amount !== undefined &&
		(!Number.isFinite(body.amount) || (body.amount as number) < 1)
	) {
		apiError(400, 'amount must be >= 1');
	}
	const result = await addOrFlipItem(body.name, {
		storeId: body.storeId ?? null,
		amount: body.amount,
		addedById: body.addedById ?? null
	});
	if (!result) apiError(400, 'name required');
	return json(result, { status: result.mode === 'created' ? 201 : 200 });
};
