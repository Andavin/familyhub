import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createStore, listStores, reorderStores } from '$lib/server/stores';

export const GET: RequestHandler = async () => {
	return json(await listStores());
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		emoji?: string;
		color?: string;
	};
	const row = await createStore(body.name ?? '', {
		emoji: body.emoji,
		color: body.color
	});
	if (!row) return json({ error: 'name required' }, { status: 400 });
	return json(row, { status: 201 });
};

export const PATCH: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as { orderedIds?: unknown };
	if (!Array.isArray(body.orderedIds) || body.orderedIds.some((v) => !Number.isFinite(v))) {
		throw error(400, 'orderedIds must be an array of numbers');
	}
	await reorderStores(body.orderedIds as number[]);
	return new Response(null, { status: 204 });
};
