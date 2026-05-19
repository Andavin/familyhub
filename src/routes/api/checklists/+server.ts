import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { checklists } from '$lib/server/schema';
import type { ChecklistItem } from '$lib/server/schema';
import { setChecklistTags } from '$lib/server/tags';
import { apiError } from '$lib/server/api-error';
import { broadcast } from '$lib/server/events';

export const GET: RequestHandler = async () => {
	const rows = await db.select().from(checklists);
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		description?: string;
		emoji?: string;
		items?: ChecklistItem[];
		defaultPriority?: number;
		defaultDueTime?: string | null;
		defaultTagIds?: number[];
	};
	if (!body.name?.trim()) apiError(400, 'name required');
	if (!Array.isArray(body.items)) apiError(400, 'items must be an array');
	if (
		body.defaultPriority !== undefined &&
		(!Number.isInteger(body.defaultPriority) ||
			body.defaultPriority < 0 ||
			body.defaultPriority > 3)
	) {
		apiError(400, 'defaultPriority must be 0, 1, 2, or 3');
	}
	const [row] = await db
		.insert(checklists)
		.values({
			name: body.name.trim(),
			description: body.description,
			emoji: body.emoji ?? '📋',
			items: body.items,
			defaultPriority:
				typeof body.defaultPriority === 'number' ? body.defaultPriority : 0,
			defaultDueTime: body.defaultDueTime ?? null
		})
		.returning();

	if (Array.isArray(body.defaultTagIds)) {
		await setChecklistTags(row.id, body.defaultTagIds);
	}

	broadcast('checklists');
	return json(row, { status: 201 });
};
