import { db } from './db';
import { lists, type List } from './schema';
import { eq, and, isNull, asc } from 'drizzle-orm';

export const INBOX_SYSTEM = 'inbox';
const INBOX_NAME = 'Unassigned';

/**
 * Find or create the "Unassigned" inbox list. It always sorts first
 * (displayOrder = -1), has no owner, and is marked system='inbox' so the UI
 * knows it can't be renamed/deleted via the normal flow.
 */
export async function getOrCreateInbox(): Promise<List> {
	const [existing] = await db
		.select()
		.from(lists)
		.where(eq(lists.system, INBOX_SYSTEM))
		.limit(1);
	if (existing) return existing;

	const [created] = await db
		.insert(lists)
		.values({
			name: INBOX_NAME,
			color: 'brown',
			ownerId: null,
			kind: 'chores',
			system: INBOX_SYSTEM,
			displayOrder: -1
		})
		.returning();
	return created;
}

/**
 * Return the user's first owned chores list (by displayOrder), if any.
 */
export async function firstOwnedList(userId: number): Promise<List | null> {
	const [row] = await db
		.select()
		.from(lists)
		.where(and(eq(lists.ownerId, userId), eq(lists.kind, 'chores')))
		.orderBy(asc(lists.displayOrder))
		.limit(1);
	return row ?? null;
}
