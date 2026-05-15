import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { reAddFromPurchase } from '$lib/server/grocery';

export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as { addedById?: number | null };
	const row = await reAddFromPurchase(id, body.addedById ?? null);
	if (!row) throw error(404, 'purchase not found');
	return json(row, { status: 201 });
};
