import { db } from './db';
import {
	tasks,
	lists,
	checklists,
	taskTags,
	type ChecklistItem,
	type List
} from './schema';
import { eq } from 'drizzle-orm';
import { getOrCreateInbox } from './inbox';
import { getChecklistTagIds, tagsExist } from './tags';

export type AppliedTaskSeed = {
	listId: number;
	assigneeId: number | null;
	title: string;
	notes: string | null;
	dueAt: Date | null;
	dueHasTime: boolean;
	priority: number;
};

export type ApplyChecklistOptions = {
	startDate?: Date;
	/** Wall-clock 'HH:MM' applied to every item that gets a due date. */
	dueTime?: string | null;
	priority?: number;
	tagIds?: number[];
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
 *
 * `dueTime` (HH:MM) overlays a wall-clock onto every offsetDays-derived
 * date. `priority` is applied uniformly to every seed.
 */
/**
 * If `opts.startDate` is provided, every task gets a due date anchored to
 * it (plus the item's `offsetDays`, defaulting to 0). If `startDate` is
 * omitted, only items with an explicit `offsetDays` get a date — matching
 * the original "checklist as relative template" behavior.
 *
 * `dueTime` overlays a wall-clock onto every dated seed. `priority`
 * applies uniformly to every seed.
 */
export function resolveChecklist(
	items: ChecklistItem[],
	listsById: Map<number, List>,
	inboxListId: number,
	opts: { startDate?: Date; dueTime?: string | null; priority?: number } = {}
): AppliedTaskSeed[] {
	const priority = opts.priority ?? 0;
	const time = parseHHMM(opts.dueTime);

	return items.map((item) => {
		const list = listsById.get(item.listId);
		const listId = list?.id ?? inboxListId;
		const assigneeId = list?.ownerId ?? null;

		let dueAt: Date | null = null;
		let dueHasTime = false;
		const offsetDays =
			typeof item.offsetDays === 'number' ? item.offsetDays : opts.startDate ? 0 : null;
		if (opts.startDate && offsetDays !== null) {
			const base = new Date(opts.startDate.getTime() + offsetDays * 86_400_000);
			if (time) {
				base.setHours(time.h, time.m, 0, 0);
				dueHasTime = true;
			} else {
				base.setHours(0, 0, 0, 0);
			}
			dueAt = base;
		} else if (!opts.startDate && typeof item.offsetDays === 'number') {
			// Legacy: caller didn't pick a date, but the template item declared
			// a relative offset → anchor at "now" so the offset is meaningful.
			const base = new Date(Date.now() + item.offsetDays * 86_400_000);
			base.setHours(0, 0, 0, 0);
			dueAt = base;
		}

		return {
			listId,
			assigneeId,
			title: item.title,
			notes: item.notes ?? null,
			dueAt,
			dueHasTime,
			priority
		};
	});
}

function parseHHMM(s: string | null | undefined): { h: number; m: number } | null {
	if (!s) return null;
	const m = s.match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return null;
	const h = Number(m[1]);
	const min = Number(m[2]);
	if (h < 0 || h > 23 || min < 0 || min > 59) return null;
	return { h, m: min };
}

export async function applyChecklist(checklistId: number, opts: ApplyChecklistOptions = {}) {
	const [cl] = await db
		.select()
		.from(checklists)
		.where(eq(checklists.id, checklistId))
		.limit(1);
	if (!cl) throw new Error(`Checklist ${checklistId} not found`);

	// Caller-supplied options win; missing values fall back to the
	// checklist's saved defaults. `undefined` means "not supplied" → use
	// defaults; an empty array/null is an explicit "clear" from the user.
	const priority = opts.priority ?? cl.defaultPriority;
	const dueTime = opts.dueTime === undefined ? cl.defaultDueTime : opts.dueTime;
	const tagIds =
		opts.tagIds === undefined ? await getChecklistTagIds(checklistId) : opts.tagIds;

	const allLists = await db.select().from(lists);
	const listsById = new Map<number, List>(allLists.map((l) => [l.id, l]));
	const inbox = await getOrCreateInbox();
	const seeds = resolveChecklist(cl.items, listsById, inbox.id, {
		startDate: opts.startDate,
		dueTime,
		priority
	});

	if (seeds.length === 0) return [];

	const inserted = await db.insert(tasks).values(seeds).returning();
	if (tagIds.length > 0 && inserted.length > 0) {
		// Caller-supplied IDs may be stale or hostile — drop unknowns
		// before the join-table insert so one bad ID doesn't FK-fail
		// the whole apply.
		const validTagIds = await tagsExist(tagIds, 'task');
		if (validTagIds.length > 0) {
			const rows = inserted.flatMap((t) =>
				validTagIds.map((tagId) => ({ taskId: t.id, tagId }))
			);
			await db.insert(taskTags).values(rows);
		}
	}
	return inserted;
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
