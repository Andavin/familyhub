import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applyChecklist } from '$lib/server/checklists';
import { apiError } from '$lib/server/api-error';

/**
 * Parse a `YYYY-MM-DD` string into a local-midnight Date. Used for
 * apply's `startDate` so the calendar day the user picked maps to the
 * same calendar day on the server, instead of being shifted by the
 * client→server timezone gap (which an ISO round-trip would cause
 * when the server was UTC and the family was west of UTC).
 *
 * Returns undefined for missing input. Throws a 400 for malformed
 * input so a caller who sent (e.g.) an ISO timestamp learns about
 * the mistake rather than silently getting "no anchor".
 */
function parseStartDate(s: string | undefined): Date | undefined {
	if (s === undefined || s === null || s === '') return undefined;
	const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) apiError(400, 'startDate must be a calendar date in YYYY-MM-DD format');
	const [, y, mo, d] = m;
	const date = new Date(+y, +mo - 1, +d);
	if (Number.isNaN(date.getTime())) apiError(400, 'startDate is not a valid calendar date');
	return date;
}

function validateDueTime(s: string | null | undefined): void {
	if (s === undefined || s === null || s === '') return;
	if (!/^\d{1,2}:\d{2}$/.test(s)) apiError(400, 'dueTime must be HH:MM');
	const [hh, mm] = s.split(':').map(Number);
	if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
		apiError(400, 'dueTime is not a valid wall-clock time');
	}
}

export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as {
		startDate?: string;
		dueTime?: string | null;
		priority?: number;
		tagIds?: number[];
	};
	if (
		body.priority !== undefined &&
		(!Number.isInteger(body.priority) || body.priority < 0 || body.priority > 3)
	) {
		apiError(400, 'priority must be 0, 1, 2, or 3');
	}
	if (body.tagIds !== undefined && !Array.isArray(body.tagIds)) {
		apiError(400, 'tagIds must be an array of numbers');
	}
	validateDueTime(body.dueTime);

	const inserted = await applyChecklist(id, {
		startDate: parseStartDate(body.startDate),
		dueTime: body.dueTime,
		priority: body.priority,
		tagIds: body.tagIds
	});
	return json({ inserted });
};
