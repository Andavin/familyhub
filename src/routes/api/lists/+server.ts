import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { lists } from '$lib/server/schema';
import { asc } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
	const rows = await db.select().from(lists).orderBy(asc(lists.displayOrder));
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as {
		name: string;
		color?: string;
		ownerId?: number | null;
		kind?: 'chores' | 'grocery' | 'general';
		displayOrder?: number;
	};
	if (!body.name) return json({ error: 'name required' }, { status: 400 });
	const [row] = await db
		.insert(lists)
		.values({
			name: body.name,
			color: body.color ?? 'blue',
			ownerId: body.ownerId ?? null,
			kind: body.kind ?? 'chores',
			displayOrder: body.displayOrder ?? 0
		})
		.returning();
	return json(row, { status: 201 });
};
