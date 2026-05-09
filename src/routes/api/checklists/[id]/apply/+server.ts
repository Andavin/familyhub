import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applyChecklist } from '$lib/server/checklists';

export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as {
		startDate?: string;
	};
	const inserted = await applyChecklist(id, {
		startDate: body.startDate ? new Date(body.startDate) : undefined
	});
	return json({ inserted });
};
