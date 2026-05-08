import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { templates } from '$lib/server/schema';
import type { TemplateItem } from '$lib/server/schema';

export const GET: RequestHandler = async () => {
	const rows = await db.select().from(templates);
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as {
		name: string;
		description?: string;
		emoji?: string;
		items: TemplateItem[];
	};
	if (!body.name || !Array.isArray(body.items)) {
		return json({ error: 'name and items required' }, { status: 400 });
	}
	const [row] = await db
		.insert(templates)
		.values({
			name: body.name,
			description: body.description,
			emoji: body.emoji ?? '📋',
			items: body.items
		})
		.returning();
	return json(row, { status: 201 });
};
