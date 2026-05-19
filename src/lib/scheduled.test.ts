import { describe, it, expect } from 'vitest';
import { buildScheduled } from './scheduled';

type T = { id: number; dueAt: Date | null; dueHasTime: boolean };

describe('buildScheduled', () => {
	it('drops overdue items from listOpen (they belong in Today)', () => {
		const past: T = { id: 1, dueAt: new Date(Date.now() - 86_400_000), dueHasTime: true };
		const future: T = { id: 2, dueAt: new Date(Date.now() + 86_400_000), dueHasTime: true };
		const result = buildScheduled([past, future], []);
		expect(result.map((t) => t.id)).toEqual([2]);
	});

	it('keeps non-recurring future-dated items', () => {
		const future: T = { id: 9, dueAt: new Date(Date.now() + 3 * 86_400_000), dueHasTime: true };
		const result = buildScheduled([future], []);
		expect(result.map((t) => t.id)).toEqual([9]);
	});

	it('passes projected entries through', () => {
		const proj: T = { id: 5, dueAt: new Date(Date.now() + 86_400_000), dueHasTime: true };
		const result = buildScheduled([], [proj]);
		expect(result).toEqual([proj]);
	});

	// This is the actual regression. Server-side `isOverdue` (UTC) flagged the
	// task as overdue and pushed a projection. The browser's `isOverdue`,
	// running in a non-UTC tz for a date-only task, disagrees and keeps the
	// original in listOpen. Without dedup, both halves carry id=42 — the
	// `{#each scheduled as task (task.id)}` block then throws
	// `each_key_duplicate`. Pin a "today, no-time, but not-yet-overdue per the
	// browser" dueAt by setting it to end-of-day local-time, which the
	// `hasTime=false` branch treats as still-actionable until midnight.
	it('drops the original when a projection exists for the same id (tz-skew repro)', () => {
		const todayEvening = new Date();
		todayEvening.setHours(23, 0, 0, 0);
		const original: T = { id: 42, dueAt: todayEvening, dueHasTime: false };
		const projected: T = { id: 42, dueAt: new Date(Date.now() + 86_400_000), dueHasTime: false };

		const result = buildScheduled([original], [projected]);

		const ids = result.map((t) => t.id);
		expect(ids).toEqual([42]);
		expect(new Set(ids).size).toBe(ids.length); // no duplicate keys
		expect(result[0].dueAt).toBe(projected.dueAt); // projected wins
	});
});
