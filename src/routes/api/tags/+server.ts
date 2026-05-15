import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrCreateTag, listTags } from '$lib/server/tags';
import type { TagScope } from '$lib/server/schema';

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
		throw error(400, 'invalid scope');
	}
	const tag = await getOrCreateTag(body.name ?? '', parseScope(body.scope));
	if (!tag) return json({ error: 'name required' }, { status: 400 });
	return json(tag, { status: 201 });
};
