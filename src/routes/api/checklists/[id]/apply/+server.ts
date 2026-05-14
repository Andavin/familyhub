import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applyChecklist } from '$lib/server/checklists';

/**
 * Parse a `YYYY-MM-DD` string into a local-midnight Date. Used for
 * apply's `startDate` so the calendar day the user picked maps to the
 * same calendar day on the server, instead of being shifted by the
 * client→server timezone gap (which the previous ISO round-trip would
 * cause when the server was UTC and the family was west of UTC).
 *
 * Returns undefined for missing / malformed input — the caller treats
 * that as "no anchor date" rather than failing the request.
 */
function parseDateOnly(s: string | undefined): Date | undefined {
	if (!s) return undefined;
	const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return undefined;
	const [, y, mo, d] = m;
	return new Date(+y, +mo - 1, +d);
}

export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as {
		startDate?: string;
		dueTime?: string | null;
		priority?: number;
		tagIds?: number[];
	};
	const inserted = await applyChecklist(id, {
		startDate: parseDateOnly(body.startDate),
		dueTime: body.dueTime,
		priority: body.priority,
		tagIds: body.tagIds
	});
	return json({ inserted });
};
