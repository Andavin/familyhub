import { describe, it, expect } from 'vitest';
import { resolveChecklist } from './checklists';
import type { ChecklistItem, List } from './schema';

function mkList(id: number, ownerId: number | null, name = `list-${id}`): List {
	return {
		id,
		name,
		color: 'blue',
		ownerId,
		kind: 'chores',
		system: 'none',
		displayOrder: id
	};
}

describe('resolveChecklist', () => {
	const adultList = mkList(10, 1, "Alex's Tasks");
	const partnersList = mkList(20, 2, "Partner's Tasks");
	const familyList = mkList(30, null, 'Family');
	const inboxId = 99;
	const listsById = new Map<number, List>([
		[adultList.id, adultList],
		[partnersList.id, partnersList],
		[familyList.id, familyList]
	]);

	it("routes to a person's list and inherits the owner as assignee", () => {
		const items: ChecklistItem[] = [{ title: 'Pack chargers', listId: adultList.id }];
		const seeds = resolveChecklist(items, listsById, inboxId);
		expect(seeds).toHaveLength(1);
		expect(seeds[0].listId).toBe(adultList.id);
		expect(seeds[0].assigneeId).toBe(1);
	});

	it('shared list → null assignee', () => {
		const items: ChecklistItem[] = [{ title: 'Wash sheets', listId: familyList.id }];
		const seeds = resolveChecklist(items, listsById, inboxId);
		expect(seeds[0].listId).toBe(familyList.id);
		expect(seeds[0].assigneeId).toBeNull();
	});

	it('unknown listId falls back to inbox', () => {
		const items: ChecklistItem[] = [{ title: 'Stale', listId: 999 }];
		const seeds = resolveChecklist(items, listsById, inboxId);
		expect(seeds[0].listId).toBe(inboxId);
		expect(seeds[0].assigneeId).toBeNull();
	});

	it('applies offsetDays to dueAt relative to startDate', () => {
		const start = new Date(2026, 4, 6, 0, 0, 0, 0);
		const items: ChecklistItem[] = [
			{ title: 'A', listId: adultList.id, offsetDays: 0 },
			{ title: 'B', listId: adultList.id, offsetDays: 3 }
		];
		const seeds = resolveChecklist(items, listsById, inboxId, { startDate: start });
		expect(seeds[0].dueAt?.getTime()).toBe(start.getTime());
		expect(seeds[1].dueAt?.getTime()).toBe(start.getTime() + 3 * 86_400_000);
		expect(seeds[0].dueHasTime).toBe(false);
	});

	it('overlays HH:MM dueTime onto every dated seed', () => {
		const start = new Date(2026, 4, 6, 0, 0, 0, 0);
		const items: ChecklistItem[] = [
			{ title: 'A', listId: adultList.id, offsetDays: 0 },
			{ title: 'B', listId: adultList.id, offsetDays: 1 },
			{ title: 'C', listId: adultList.id } // un-offset — picks up start + 0
		];
		const seeds = resolveChecklist(items, listsById, inboxId, {
			startDate: start,
			dueTime: '09:30'
		});
		expect(seeds[0].dueAt?.getHours()).toBe(9);
		expect(seeds[0].dueAt?.getMinutes()).toBe(30);
		expect(seeds[0].dueHasTime).toBe(true);
		expect(seeds[1].dueHasTime).toBe(true);
		expect(seeds[2].dueAt?.getTime()).toBe(new Date(2026, 4, 6, 9, 30, 0, 0).getTime());
		expect(seeds[2].dueHasTime).toBe(true);
	});

	it('ignores invalid dueTime strings (no time applied)', () => {
		const start = new Date(2026, 4, 6, 0, 0, 0, 0);
		const items: ChecklistItem[] = [{ title: 'A', listId: adultList.id, offsetDays: 0 }];
		const seeds = resolveChecklist(items, listsById, inboxId, {
			startDate: start,
			dueTime: 'nope'
		});
		expect(seeds[0].dueHasTime).toBe(false);
	});

	it('priority applies uniformly to every seed', () => {
		const items: ChecklistItem[] = [
			{ title: 'A', listId: adultList.id },
			{ title: 'B', listId: partnersList.id }
		];
		const seeds = resolveChecklist(items, listsById, inboxId, { priority: 2 });
		expect(seeds.every((s) => s.priority === 2)).toBe(true);
	});

	it('omits dueAt when offsetDays not provided and no startDate given', () => {
		const items: ChecklistItem[] = [{ title: 'A', listId: adultList.id }];
		const seeds = resolveChecklist(items, listsById, inboxId);
		expect(seeds[0].dueAt).toBeNull();
	});

	it('anchors un-offset items to startDate when caller supplies one', () => {
		const start = new Date(2026, 4, 6, 0, 0, 0, 0);
		const items: ChecklistItem[] = [
			{ title: 'A', listId: adultList.id }, // no offsetDays
			{ title: 'B', listId: adultList.id, offsetDays: 2 }
		];
		const seeds = resolveChecklist(items, listsById, inboxId, { startDate: start });
		expect(seeds[0].dueAt?.getTime()).toBe(start.getTime());
		expect(seeds[1].dueAt?.getTime()).toBe(start.getTime() + 2 * 86_400_000);
	});

	it('local-midnight startDate lands on the same calendar day in local time', () => {
		// Regression: the apply endpoint now parses YYYY-MM-DD into
		// `new Date(y, m-1, d)` (local midnight) instead of round-
		// tripping through ISO/UTC. That round-trip would shift the
		// day for viewers west of the server.
		const start = new Date(2026, 4, 14, 0, 0, 0, 0);
		const items: ChecklistItem[] = [{ title: 'A', listId: adultList.id, offsetDays: 0 }];
		const seeds = resolveChecklist(items, listsById, inboxId, { startDate: start });
		expect(seeds[0].dueAt?.getFullYear()).toBe(2026);
		expect(seeds[0].dueAt?.getMonth()).toBe(4);
		expect(seeds[0].dueAt?.getDate()).toBe(14);
		expect(seeds[0].dueAt?.getHours()).toBe(0);
	});

	it('passes through notes', () => {
		const items: ChecklistItem[] = [
			{ title: 'A', listId: adultList.id, notes: 'Remember the dog' }
		];
		const seeds = resolveChecklist(items, listsById, inboxId);
		expect(seeds[0].notes).toBe('Remember the dog');
	});

	it('produces N seeds for N items', () => {
		const items: ChecklistItem[] = Array.from({ length: 15 }, () => ({
			title: 'x',
			listId: adultList.id
		}));
		const seeds = resolveChecklist(items, listsById, inboxId);
		expect(seeds).toHaveLength(15);
	});
});
