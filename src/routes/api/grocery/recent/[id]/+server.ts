import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { reAddFromPurchase } from '$lib/server/grocery';
import { apiError } from '$lib/server/api-error';

export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as { addedById?: number | null };
	const row = await reAddFromPurchase(id, body.addedById ?? null);
	if (!row) apiError(404, 'purchase not found');
	return json(row, { status: 201 });
};
