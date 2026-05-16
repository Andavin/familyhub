import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { tasks } from '$lib/server/schema';
import { asc, eq, isNull, and } from 'drizzle-orm';
import { apiError } from '$lib/server/api-error';
import { parseDateField } from '$lib/server/parse';
import { setTaskTags } from '$lib/server/tags';

export const GET: RequestHandler = async ({ url }) => {
	const includeCompleted = url.searchParams.get('includeCompleted') === 'true';
	const listIdParam = url.searchParams.get('listId');
	let listId: number | undefined;
	if (listIdParam !== null) {
		const n = Number(listIdParam);
		if (!Number.isFinite(n)) apiError(400, 'listId must be a number');
		listId = n;
	}

	const filters = [];
	if (!includeCompleted) filters.push(isNull(tasks.completedAt));
	if (listId !== undefined) filters.push(eq(tasks.listId, listId));

	const where = filters.length ? and(...filters) : undefined;
	const rows = await db
		.select()
		.from(tasks)
		.where(where)
		.orderBy(asc(tasks.sortOrder), asc(tasks.createdAt));
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		listId?: number;
		title?: string;
		assigneeId?: number | null;
		notes?: string | null;
		dueAt?: string | null;
		dueHasTime?: boolean;
		rrule?: string | null;
		recurFromCompletion?: boolean;
		priority?: number;
		sortOrder?: number;
		tagIds?: number[];
	};
	if (!Number.isFinite(body.listId)) apiError(400, 'listId required');
	if (!body.title?.trim()) apiError(400, 'title required');
	if (
		body.priority !== undefined &&
		(!Number.isInteger(body.priority) || body.priority < 0 || body.priority > 3)
	) {
		apiError(400, 'priority must be 0, 1, 2, or 3');
	}
	if (body.tagIds !== undefined && !Array.isArray(body.tagIds)) {
		apiError(400, 'tagIds must be an array of numbers');
	}

	const dueAt = parseDateField(body.dueAt, 'dueAt');

	const [row] = await db
		.insert(tasks)
		.values({
			listId: body.listId as number,
			title: body.title.trim(),
			assigneeId: body.assigneeId ?? null,
			notes: body.notes ?? null,
			dueAt,
			dueHasTime: !!body.dueHasTime,
			rrule: body.rrule ?? null,
			recurFromCompletion: !!body.recurFromCompletion,
			priority: body.priority ?? 0,
			sortOrder: body.sortOrder ?? 0
		})
		.returning();

	if (Array.isArray(body.tagIds) && body.tagIds.length > 0) {
		await setTaskTags(row.id, body.tagIds);
	}

	return json(row, { status: 201 });
};
