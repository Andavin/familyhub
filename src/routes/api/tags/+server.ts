import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrCreateTag, listTags } from '$lib/server/tags';
import type { TagScope } from '$lib/server/schema';
import { apiError } from '$lib/server/api-error';
import { broadcast } from '$lib/server/events';

function parseScope(raw: unknown): TagScope {
	return raw === 'grocery' ? 'grocery' : 'task';
}

export const GET: RequestHandler = async ({ url }) => {
	return json(await listTags(parseScope(url.searchParams.get('scope'))));
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		scope?: string;
	};
	if (body.scope && body.scope !== 'task' && body.scope !== 'grocery') {
		apiError(400, 'scope must be "task" or "grocery"');
	}
	const tag = await getOrCreateTag(body.name ?? '', parseScope(body.scope));
	if (!tag) apiError(400, 'name required');
	broadcast('tags');
	return json(tag, { status: 201 });
};
