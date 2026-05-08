import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { templates } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import type { TemplateItem } from '$lib/server/schema';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	const body = (await request.json()) as Partial<{
		name: string;
		description: string;
		emoji: string;
		items: TemplateItem[];
	}>;
	const [row] = await db.update(templates).set(body).where(eq(templates.id, id)).returning();
	if (!row) throw error(404, 'not found');
	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) throw error(400, 'invalid id');
	await db.delete(templates).where(eq(templates.id, id));
	return json({ ok: true });
};
