import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteTag, renameTag } from '$lib/server/tags';
import { apiError } from '$lib/server/api-error';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as { name?: string };
	try {
		const updated = await renameTag(id, body.name ?? '');
		if (!updated) apiError(400, 'name required');
		return json(updated);
	} catch (err) {
		// Renaming to a name that already exists in the same scope
		// trips the `(name, scope)` unique index — that's user-fixable
		// so surface it as 409. Anything else is a server bug and we
		// let it bubble to handleError.
		if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
			apiError(409, 'a tag with that name already exists in this scope');
		}
		throw err;
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	await deleteTag(id);
	return json({ ok: true });
};
