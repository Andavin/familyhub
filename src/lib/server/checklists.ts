import { db } from './db';
import { tasks, lists, checklists, type ChecklistItem, type List } from './schema';
import { eq } from 'drizzle-orm';
import { getOrCreateInbox } from './inbox';

export type AppliedTaskSeed = {
	listId: number;
	assigneeId: number | null;
	title: string;
	notes: string | null;
	dueAt: Date | null;
};

/**
 * Resolve a checklist's items into concrete task seeds.
 *
 * Each item names a target list. The task lands in that list, and inherits
 * the list's `ownerId` as its assignee (so adding to a person's list
 * automatically sets them as the assignee). Items pointing at the
 * Unassigned inbox or any other shared list get a null assignee.
 *
 * If an item references a deleted list, it falls back to the inbox.
 */
export function resolveChecklist(
	items: ChecklistItem[],
	listsById: Map<number, List>,
	inboxListId: number,
	startDate: Date = new Date()
): AppliedTaskSeed[] {
	return items.map((item) => {
		const list = listsById.get(item.listId);
		const listId = list?.id ?? inboxListId;
		const assigneeId = list?.ownerId ?? null;
		const dueAt =
			typeof item.offsetDays === 'number'
				? new Date(startDate.getTime() + item.offsetDays * 86_400_000)
				: null;
		return {
			listId,
			assigneeId,
			title: item.title,
			notes: item.notes ?? null,
			dueAt
		};
	});
}

export async function applyChecklist(
	checklistId: number,
	opts: { startDate?: Date } = {}
) {
	const [cl] = await db
		.select()
		.from(checklists)
		.where(eq(checklists.id, checklistId))
		.limit(1);
	if (!cl) throw new Error(`Checklist ${checklistId} not found`);

	const allLists = await db.select().from(lists);
	const listsById = new Map<number, List>(allLists.map((l) => [l.id, l]));
	const inbox = await getOrCreateInbox();
	const seeds = resolveChecklist(cl.items, listsById, inbox.id, opts.startDate ?? new Date());

	if (seeds.length === 0) return [];

	return await db.insert(tasks).values(seeds).returning();
}

/**
 * When a list is deleted, prune any checklist items that targeted it.
 * Called from the list DELETE handler before the row is dropped.
 */
export async function pruneChecklistsForList(listId: number) {
	const all = await db.select().from(checklists);
	for (const c of all) {
		const filtered = c.items.filter((i) => i.listId !== listId);
		if (filtered.length !== c.items.length) {
			await db.update(checklists).set({ items: filtered }).where(eq(checklists.id, c.id));
		}
	}
}
