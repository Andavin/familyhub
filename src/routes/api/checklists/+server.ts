import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { checklists } from '$lib/server/schema';
import type { ChecklistItem } from '$lib/server/schema';
import { setChecklistTags } from '$lib/server/tags';

export const GET: RequestHandler = async () => {
	const rows = await db.select().from(checklists);
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as {
		name: string;
		description?: string;
		emoji?: string;
		items: ChecklistItem[];
		defaultPriority?: number;
		defaultDueTime?: string | null;
		defaultTagIds?: number[];
	};
	if (!body.name || !Array.isArray(body.items)) {
		return json({ error: 'name and items required' }, { status: 400 });
	}
	const [row] = await db
		.insert(checklists)
		.values({
			name: body.name,
			description: body.description,
			emoji: body.emoji ?? '📋',
			items: body.items,
			defaultPriority: typeof body.defaultPriority === 'number' ? body.defaultPriority : 0,
			defaultDueTime: body.defaultDueTime ?? null
		})
		.returning();

	if (Array.isArray(body.defaultTagIds)) {
		await setChecklistTags(row.id, body.defaultTagIds);
	}

	return json(row, { status: 201 });
};
