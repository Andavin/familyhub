import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { checklists } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import type { ChecklistItem } from '$lib/server/schema';
import { setChecklistTags } from '$lib/server/tags';
import { apiError } from '$lib/server/api-error';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as Partial<{
		name: string;
		description: string;
		emoji: string;
		items: ChecklistItem[];
		defaultPriority: number;
		defaultDueTime: string | null;
		defaultTagIds: number[];
	}>;
	if (
		body.defaultPriority !== undefined &&
		(!Number.isInteger(body.defaultPriority) ||
			body.defaultPriority < 0 ||
			body.defaultPriority > 3)
	) {
		apiError(400, 'defaultPriority must be 0, 1, 2, or 3');
	}
	if (body.items !== undefined && !Array.isArray(body.items)) {
		apiError(400, 'items must be an array');
	}

	const update: Record<string, unknown> = {};
	if ('name' in body) update.name = body.name;
	if ('description' in body) update.description = body.description;
	if ('emoji' in body) update.emoji = body.emoji;
	if ('items' in body) update.items = body.items;
	if ('defaultPriority' in body) update.defaultPriority = body.defaultPriority;
	if ('defaultDueTime' in body) update.defaultDueTime = body.defaultDueTime;

	let row;
	if (Object.keys(update).length > 0) {
		[row] = await db.update(checklists).set(update).where(eq(checklists.id, id)).returning();
	} else {
		[row] = await db.select().from(checklists).where(eq(checklists.id, id)).limit(1);
	}
	if (!row) apiError(404, 'not found');

	if (Array.isArray(body.defaultTagIds)) {
		await setChecklistTags(id, body.defaultTagIds);
	}

	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	await db.delete(checklists).where(eq(checklists.id, id));
	return json({ ok: true });
};
