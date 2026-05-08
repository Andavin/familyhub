import { db } from './db';
import { tasks, lists, templates, type TemplateItem } from './schema';
import { eq, and, isNull } from 'drizzle-orm';

export type AppliedTaskSeed = {
	listId: number;
	assigneeId: number | null;
	title: string;
	notes: string | null;
	dueAt: Date | null;
};

/**
 * Resolve a template's items into concrete task seeds.
 * - 'self'    → first user (caller decides which is "self")
 * - 'partner' → second user
 * - 'shared'  → null assignee, shared list
 * - number    → explicit user id
 */
export function resolveTemplate(
	items: TemplateItem[],
	userIds: { selfId: number; partnerId: number | null; sharedListId: number },
	userListIdByUserId: Map<number, number>,
	startDate: Date = new Date()
): AppliedTaskSeed[] {
	const seeds: AppliedTaskSeed[] = [];
	for (const item of items) {
		let assigneeId: number | null = null;
		let listId: number;

		if (typeof item.assigneeRole === 'number') {
			assigneeId = item.assigneeRole;
			listId = userListIdByUserId.get(assigneeId) ?? userIds.sharedListId;
		} else if (item.assigneeRole === 'self') {
			assigneeId = userIds.selfId;
			listId = userListIdByUserId.get(userIds.selfId) ?? userIds.sharedListId;
		} else if (item.assigneeRole === 'partner') {
			assigneeId = userIds.partnerId ?? userIds.selfId;
			listId =
				userListIdByUserId.get(userIds.partnerId ?? userIds.selfId) ?? userIds.sharedListId;
		} else {
			// shared
			assigneeId = null;
			listId = userIds.sharedListId;
		}

		const dueAt =
			typeof item.offsetDays === 'number'
				? new Date(startDate.getTime() + item.offsetDays * 86_400_000)
				: null;

		seeds.push({
			listId,
			assigneeId,
			title: item.title,
			notes: item.notes ?? null,
			dueAt
		});
	}
	return seeds;
}

/**
 * Apply a template by id: resolves items and inserts tasks atomically.
 * Returns the created task rows.
 */
export async function applyTemplate(
	templateId: number,
	opts: { selfUserId?: number; startDate?: Date } = {}
) {
	const [tpl] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
	if (!tpl) throw new Error(`Template ${templateId} not found`);

	const allLists = await db.select().from(lists);
	const userListIdByUserId = new Map<number, number>();
	for (const l of allLists) {
		if (l.ownerId !== null) userListIdByUserId.set(l.ownerId, l.id);
	}

	const sharedList =
		allLists.find((l) => l.ownerId === null && l.kind === 'chores') ??
		allLists.find((l) => l.ownerId === null);
	if (!sharedList) throw new Error('No shared list configured');

	// Pick "self" and "partner" by display order if not provided.
	const ownerLists = allLists
		.filter((l) => l.ownerId !== null)
		.sort((a, b) => a.displayOrder - b.displayOrder);
	const selfId = opts.selfUserId ?? ownerLists[0]?.ownerId ?? null;
	const partnerId = ownerLists[1]?.ownerId ?? null;
	if (selfId === null) throw new Error('No users configured');

	const seeds = resolveTemplate(
		tpl.items,
		{ selfId, partnerId, sharedListId: sharedList.id },
		userListIdByUserId,
		opts.startDate ?? new Date()
	);

	if (seeds.length === 0) return [];

	const inserted = await db.insert(tasks).values(seeds).returning();
	return inserted;
}
