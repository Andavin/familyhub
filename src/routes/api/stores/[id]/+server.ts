import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteStore, updateStore } from '$lib/server/stores';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		emoji?: string;
		color?: string;
	};
	const row = await updateStore(id, body);
	if (!row) return json({ error: 'invalid update' }, { status: 400 });
	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	await deleteStore(id);
	return new Response(null, { status: 204 });
};
