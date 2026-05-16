import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteStore, updateStore } from '$lib/server/stores';
import { apiError } from '$lib/server/api-error';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		emoji?: string;
		color?: string;
	};
	const row = await updateStore(id, body);
	if (!row) apiError(400, 'invalid update');
	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	await deleteStore(id);
	return json({ ok: true });
};
