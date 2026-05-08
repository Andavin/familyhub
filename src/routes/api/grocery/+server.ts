import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { groceryItems } from '$lib/server/schema';
import { asc, isNull } from 'drizzle-orm';
import { categorize } from '$lib/server/grocery';

export const GET: RequestHandler = async ({ url }) => {
	const includeChecked = url.searchParams.get('includeChecked') === 'true';
	const where = includeChecked ? undefined : isNull(groceryItems.checkedAt);
	const rows = await db.select().from(groceryItems).where(where).orderBy(asc(groceryItems.createdAt));
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as {
		name: string;
		quantity?: string;
		category?: string;
		addedById?: number;
	};
	if (!body.name) return json({ error: 'name required' }, { status: 400 });
	const [row] = await db
		.insert(groceryItems)
		.values({
			name: body.name,
			quantity: body.quantity,
			category: body.category ?? categorize(body.name),
			addedById: body.addedById
		})
		.returning();
	return json(row, { status: 201 });
};

export const DELETE: RequestHandler = async ({ url }) => {
	// Clear all checked items
	const checkedOnly = url.searchParams.get('checked') === 'true';
	if (!checkedOnly) return json({ error: 'use ?checked=true' }, { status: 400 });
	await db.delete(groceryItems);
	return json({ ok: true });
};
