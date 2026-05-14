import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrCreateTag, listTags } from '$lib/server/tags';

export const GET: RequestHandler = async () => {
	return json(await listTags());
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as { name?: string };
	const tag = await getOrCreateTag(body.name ?? '');
	if (!tag) return json({ error: 'name required' }, { status: 400 });
	return json(tag, { status: 201 });
};
