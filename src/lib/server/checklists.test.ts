import { describe, it, expect } from 'vitest';
import { resolveChecklist } from './checklists';
import type { ChecklistItem } from './schema';

describe('resolveChecklist', () => {
	const userListIdByUserId = new Map<number, number>([
		[1, 10],
		[2, 20]
	]);
	const userIds = { selfId: 1, partnerId: 2, sharedListId: 99 };

	it('routes self → self user list', () => {
		const items: ChecklistItem[] = [{ title: 'Pack chargers', assigneeRole: 'self' }];
		const seeds = resolveChecklist(items, userIds, userListIdByUserId);
		expect(seeds).toHaveLength(1);
		expect(seeds[0].assigneeId).toBe(1);
		expect(seeds[0].listId).toBe(10);
	});

	it('routes partner → partner user list', () => {
		const items: ChecklistItem[] = [{ title: 'Water plants', assigneeRole: 'partner' }];
		const seeds = resolveChecklist(items, userIds, userListIdByUserId);
		expect(seeds[0].assigneeId).toBe(2);
		expect(seeds[0].listId).toBe(20);
	});

	it('routes shared → shared list with no assignee', () => {
		const items: ChecklistItem[] = [{ title: 'Check passports', assigneeRole: 'shared' }];
		const seeds = resolveChecklist(items, userIds, userListIdByUserId);
		expect(seeds[0].assigneeId).toBeNull();
		expect(seeds[0].listId).toBe(99);
	});

	it('routes explicit user id', () => {
		const items: ChecklistItem[] = [{ title: 'Test', assigneeRole: 2 }];
		const seeds = resolveChecklist(items, userIds, userListIdByUserId);
		expect(seeds[0].assigneeId).toBe(2);
		expect(seeds[0].listId).toBe(20);
	});

	it('falls back to shared list for unknown explicit id', () => {
		const items: ChecklistItem[] = [{ title: 'Test', assigneeRole: 999 }];
		const seeds = resolveChecklist(items, userIds, userListIdByUserId);
		expect(seeds[0].assigneeId).toBe(999);
		expect(seeds[0].listId).toBe(99);
	});

	it('applies offsetDays to dueAt relative to startDate', () => {
		const start = new Date('2026-05-06T00:00:00Z');
		const items: ChecklistItem[] = [
			{ title: 'A', assigneeRole: 'self', offsetDays: 0 },
			{ title: 'B', assigneeRole: 'self', offsetDays: 3 }
		];
		const seeds = resolveChecklist(items, userIds, userListIdByUserId, start);
		expect(seeds[0].dueAt?.getTime()).toBe(start.getTime());
		expect(seeds[1].dueAt?.getTime()).toBe(start.getTime() + 3 * 86_400_000);
	});

	it('passes through notes', () => {
		const items: ChecklistItem[] = [
			{ title: 'A', assigneeRole: 'self', notes: 'Remember the dog' }
		];
		const seeds = resolveChecklist(items, userIds, userListIdByUserId);
		expect(seeds[0].notes).toBe('Remember the dog');
	});

	it('produces N seeds for N items', () => {
		const items: ChecklistItem[] = Array.from({ length: 15 }, (_, i) => ({
			title: `Task ${i}`,
			assigneeRole: 'self' as const
		}));
		const seeds = resolveChecklist(items, userIds, userListIdByUserId);
		expect(seeds).toHaveLength(15);
	});
});
