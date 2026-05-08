import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { asc } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
	const rows = await db.select().from(users).orderBy(asc(users.displayOrder));
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as {
		name: string;
		color?: string;
		emoji?: string;
		displayOrder?: number;
	};
	if (!body.name) return json({ error: 'name required' }, { status: 400 });
	const [row] = await db
		.insert(users)
		.values({
			name: body.name,
			color: body.color ?? 'blue',
			emoji: body.emoji ?? '🙂',
			displayOrder: body.displayOrder ?? 0
		})
		.returning();
	return json(row, { status: 201 });
};
