import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { groceryItems } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	const body = (await request.json()) as Partial<{
		name: string;
		quantity: string | null;
		category: string;
		checked: boolean;
	}>;
	const update: Record<string, unknown> = {};
	if ('name' in body) update.name = body.name;
	if ('quantity' in body) update.quantity = body.quantity;
	if ('category' in body) update.category = body.category;
	if ('checked' in body) update.checkedAt = body.checked ? new Date() : null;
	const [row] = await db.update(groceryItems).set(update).where(eq(groceryItems.id, id)).returning();
	if (!row) throw error(404, 'not found');
	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	await db.delete(groceryItems).where(eq(groceryItems.id, id));
	return json({ ok: true });
};
