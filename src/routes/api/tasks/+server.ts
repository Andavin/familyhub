import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { tasks } from '$lib/server/schema';
import { asc, eq, isNull, and } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
	const includeCompleted = url.searchParams.get('includeCompleted') === 'true';
	const listId = url.searchParams.get('listId');

	const filters = [];
	if (!includeCompleted) filters.push(isNull(tasks.completedAt));
	if (listId) filters.push(eq(tasks.listId, Number(listId)));

	const where = filters.length ? and(...filters) : undefined;
	const rows = await db
		.select()
		.from(tasks)
		.where(where)
		.orderBy(asc(tasks.sortOrder), asc(tasks.createdAt));
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as {
		listId: number;
		title: string;
		assigneeId?: number | null;
		notes?: string;
		dueAt?: string | null;
		rrule?: string | null;
		recurFromCompletion?: boolean;
	};
	if (!body.listId || !body.title) {
		return json({ error: 'listId and title required' }, { status: 400 });
	}
	const [row] = await db
		.insert(tasks)
		.values({
			listId: body.listId,
			title: body.title,
			assigneeId: body.assigneeId ?? null,
			notes: body.notes ?? null,
			dueAt: body.dueAt ? new Date(body.dueAt) : null,
			rrule: body.rrule ?? null,
			recurFromCompletion: !!body.recurFromCompletion
		})
		.returning();
	return json(row, { status: 201 });
};
