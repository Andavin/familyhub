import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { lists } from '$lib/server/schema';
import { asc, max } from 'drizzle-orm';
import { apiError } from '$lib/server/api-error';
import { reorderLists } from '$lib/server/lists';
import { broadcast } from '$lib/server/events';

const VALID_KINDS = new Set(['chores', 'grocery', 'general']);

export const GET: RequestHandler = async () => {
	const rows = await db.select().from(lists).orderBy(asc(lists.displayOrder));
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		color?: string;
		ownerId?: number | null;
		kind?: 'chores' | 'grocery' | 'general';
		displayOrder?: number;
	};
	if (!body.name?.trim()) apiError(400, 'name required');
	if (body.kind !== undefined && !VALID_KINDS.has(body.kind)) {
		apiError(400, 'kind must be "chores", "grocery", or "general"');
	}
	let displayOrder = body.displayOrder;
	if (displayOrder === undefined) {
		const [{ value }] = await db.select({ value: max(lists.displayOrder) }).from(lists);
		displayOrder = (value ?? 0) + 1;
	}
	const [row] = await db
		.insert(lists)
		.values({
			name: body.name.trim(),
			color: body.color ?? 'blue',
			ownerId: body.ownerId ?? null,
			kind: body.kind ?? 'chores',
			displayOrder
		})
		.returning();
	broadcast('lists');
	return json(row, { status: 201 });
};

export const PATCH: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as { orderedIds?: unknown };
	if (!Array.isArray(body.orderedIds) || body.orderedIds.some((v) => !Number.isFinite(v))) {
		apiError(400, 'orderedIds must be an array of numbers');
	}
	await reorderLists(body.orderedIds as number[]);
	broadcast('lists');
	return json({ ok: true });
};
