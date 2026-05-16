import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { lists } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { pruneChecklistsForList } from '$lib/server/checklists';
import { apiError } from '$lib/server/api-error';

const VALID_KINDS = new Set(['chores', 'grocery', 'general']);

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as Partial<{
		name: string;
		color: string;
		ownerId: number | null;
		kind: 'chores' | 'grocery' | 'general';
		displayOrder: number;
	}>;
	if (body.kind !== undefined && !VALID_KINDS.has(body.kind)) {
		apiError(400, 'kind must be "chores", "grocery", or "general"');
	}
	const update: Record<string, unknown> = {};
	if ('name' in body) update.name = body.name;
	if ('color' in body) update.color = body.color;
	if ('ownerId' in body) update.ownerId = body.ownerId;
	if ('kind' in body) update.kind = body.kind;
	if ('displayOrder' in body) update.displayOrder = body.displayOrder;
	const [row] = await db.update(lists).set(update).where(eq(lists.id, id)).returning();
	if (!row) apiError(404, 'not found');
	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	await pruneChecklistsForList(id);
	await db.delete(lists).where(eq(lists.id, id));
	return json({ ok: true });
};
