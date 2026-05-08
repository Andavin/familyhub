import { describe, it, expect } from 'vitest';
import { resolveTemplate } from './templates';
import type { TemplateItem } from './schema';

describe('resolveTemplate', () => {
	const userListIdByUserId = new Map<number, number>([
		[1, 10],
		[2, 20]
	]);
	const userIds = { selfId: 1, partnerId: 2, sharedListId: 99 };

	it('routes self → self user list', () => {
		const items: TemplateItem[] = [{ title: 'Pack chargers', assigneeRole: 'self' }];
		const seeds = resolveTemplate(items, userIds, userListIdByUserId);
		expect(seeds).toHaveLength(1);
		expect(seeds[0].assigneeId).toBe(1);
		expect(seeds[0].listId).toBe(10);
	});

	it('routes partner → partner user list', () => {
		const items: TemplateItem[] = [{ title: 'Water plants', assigneeRole: 'partner' }];
		const seeds = resolveTemplate(items, userIds, userListIdByUserId);
		expect(seeds[0].assigneeId).toBe(2);
		expect(seeds[0].listId).toBe(20);
	});

	it('routes shared → shared list with no assignee', () => {
		const items: TemplateItem[] = [{ title: 'Check passports', assigneeRole: 'shared' }];
		const seeds = resolveTemplate(items, userIds, userListIdByUserId);
		expect(seeds[0].assigneeId).toBeNull();
		expect(seeds[0].listId).toBe(99);
	});

	it('routes explicit user id', () => {
		const items: TemplateItem[] = [{ title: 'Test', assigneeRole: 2 }];
		const seeds = resolveTemplate(items, userIds, userListIdByUserId);
		expect(seeds[0].assigneeId).toBe(2);
		expect(seeds[0].listId).toBe(20);
	});

	it('falls back to shared list for unknown explicit id', () => {
		const items: TemplateItem[] = [{ title: 'Test', assigneeRole: 999 }];
		const seeds = resolveTemplate(items, userIds, userListIdByUserId);
		expect(seeds[0].assigneeId).toBe(999);
		expect(seeds[0].listId).toBe(99);
	});

	it('applies offsetDays to dueAt relative to startDate', () => {
		const start = new Date('2026-05-06T00:00:00Z');
		const items: TemplateItem[] = [
			{ title: 'A', assigneeRole: 'self', offsetDays: 0 },
			{ title: 'B', assigneeRole: 'self', offsetDays: 3 }
		];
		const seeds = resolveTemplate(items, userIds, userListIdByUserId, start);
		expect(seeds[0].dueAt?.getTime()).toBe(start.getTime());
		expect(seeds[1].dueAt?.getTime()).toBe(start.getTime() + 3 * 86_400_000);
	});

	it('passes through notes', () => {
		const items: TemplateItem[] = [
			{ title: 'A', assigneeRole: 'self', notes: 'Remember the dog' }
		];
		const seeds = resolveTemplate(items, userIds, userListIdByUserId);
		expect(seeds[0].notes).toBe('Remember the dog');
	});

	it('produces N seeds for N items', () => {
		const items: TemplateItem[] = Array.from({ length: 15 }, (_, i) => ({
			title: `Task ${i}`,
			assigneeRole: 'self' as const
		}));
		const seeds = resolveTemplate(items, userIds, userListIdByUserId);
		expect(seeds).toHaveLength(15);
	});
});
