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
		const start = new Date('2026-05-06T00:00:00Z');
		const items: ChecklistItem[] = [
			{ title: 'A', listId: adultList.id, offsetDays: 0 },
			{ title: 'B', listId: adultList.id, offsetDays: 3 }
		];
		const seeds = resolveChecklist(items, listsById, inboxId, start);
		expect(seeds[0].dueAt?.getTime()).toBe(start.getTime());
		expect(seeds[1].dueAt?.getTime()).toBe(start.getTime() + 3 * 86_400_000);
	});

	it('omits dueAt when offsetDays not provided', () => {
		const items: ChecklistItem[] = [{ title: 'A', listId: adultList.id }];
		const seeds = resolveChecklist(items, listsById, inboxId);
		expect(seeds[0].dueAt).toBeNull();
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
