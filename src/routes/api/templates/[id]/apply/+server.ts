import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applyTemplate } from '$lib/server/templates';

export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as {
		selfUserId?: number;
		startDate?: string;
	};
	const inserted = await applyTemplate(id, {
		selfUserId: body.selfUserId,
		startDate: body.startDate ? new Date(body.startDate) : undefined
	});
	return json({ inserted });
};
