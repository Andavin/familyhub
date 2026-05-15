import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteTag, renameTag } from '$lib/server/tags';
import { apiError, describeError } from '$lib/server/api-error';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as { name?: string };
	try {
		const updated = await renameTag(id, body.name ?? '');
		if (!updated) apiError(400, 'name required');
		return json(updated);
	} catch (err) {
		// UNIQUE (name, scope) is the only failure mode here outside of
		// our own apiError. Surface it as a 409 with a clear message
		// rather than the framework's default 500.
		if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
			apiError(409, 'a tag with that name already exists in this scope');
		}
		// re-throw anything we don't recognise so SvelteKit's handleError
		// can do its job (and so apiError(...) from above isn't swallowed).
		if (err instanceof Error && describeError(err) !== err.message) {
			// matched a known constraint family → already user-facing
			apiError(400, describeError(err));
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
