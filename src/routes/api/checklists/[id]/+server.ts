import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { checklists } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import type { ChecklistItem } from '$lib/server/schema';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	const body = (await request.json()) as Partial<{
		name: string;
		description: string;
		emoji: string;
		items: ChecklistItem[];
	}>;
	const [row] = await db.update(checklists).set(body).where(eq(checklists.id, id)).returning();
	if (!row) throw error(404, 'not found');
	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	await db.delete(checklists).where(eq(checklists.id, id));
	return json({ ok: true });
};
