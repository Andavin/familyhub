import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteTag, renameTag } from '$lib/server/tags';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as { name?: string };
	const updated = await renameTag(id, body.name ?? '');
	if (!updated) return json({ error: 'name required' }, { status: 400 });
	return json(updated);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	await deleteTag(id);
	return new Response(null, { status: 204 });
};
