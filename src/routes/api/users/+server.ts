import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users, lists } from '$lib/server/schema';
import { asc, max } from 'drizzle-orm';

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
		createList?: boolean; // defaults to true
	};
	if (!body.name) return json({ error: 'name required' }, { status: 400 });

	let displayOrder = body.displayOrder;
	if (displayOrder === undefined) {
		const [{ value }] = await db.select({ value: max(users.displayOrder) }).from(users);
		displayOrder = (value ?? 0) + 1;
	}

	const [user] = await db
		.insert(users)
		.values({
			name: body.name,
			color: body.color ?? 'blue',
			emoji: body.emoji ?? '🙂',
			displayOrder
		})
		.returning();

	if (body.createList !== false) {
		const [{ value: maxListOrder }] = await db
			.select({ value: max(lists.displayOrder) })
			.from(lists);
		await db.insert(lists).values({
			name: `${user.name}'s Tasks`,
			color: user.color,
			ownerId: user.id,
			kind: 'chores',
			displayOrder: (maxListOrder ?? 0) + 1
		});
	}

	return json(user, { status: 201 });
};
