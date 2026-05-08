import { describe, it, expect } from 'vitest';
import { buildRrule, nextOccurrence, describeRrule } from './recurrence';

describe('recurrence', () => {
	it('returns null when no frequency', () => {
		expect(buildRrule(null)).toBeNull();
	});

	it('builds a daily RRULE', () => {
		const r = buildRrule('daily');
		expect(r).toMatch(/FREQ=DAILY/);
	});

	it('builds a weekly RRULE on Mon/Wed', () => {
		const r = buildRrule('weekly', { byweekday: [0, 2] });
		expect(r).toMatch(/FREQ=WEEKLY/);
		expect(r).toMatch(/BYDAY=/);
	});

	it('computes next occurrence after given date for daily rule', () => {
		const r = buildRrule('daily');
		expect(r).not.toBeNull();
		const after = new Date('2026-05-06T10:00:00Z');
		const next = nextOccurrence(r as string, after);
		expect(next).not.toBeNull();
		// next should be strictly after `after`
		expect((next as Date).getTime()).toBeGreaterThan(after.getTime());
	});

	it('weekly recurrence advances by ~7 days', () => {
		const r = buildRrule('weekly');
		const after = new Date('2026-05-06T10:00:00Z');
		const next = nextOccurrence(r as string, after);
		expect(next).not.toBeNull();
		const delta = (next as Date).getTime() - after.getTime();
		expect(delta).toBeGreaterThanOrEqual(6 * 86_400_000);
		expect(delta).toBeLessThanOrEqual(8 * 86_400_000);
	});

	it('describeRrule returns a human string for valid rule', () => {
		const r = buildRrule('daily') as string;
		expect(describeRrule(r).toLowerCase()).toMatch(/daily|every day/);
	});

	it('describeRrule returns the input for invalid rule', () => {
		expect(describeRrule('garbage')).toBe('garbage');
	});

	it('returns null after final occurrence (count=1)', () => {
		const r = buildRrule('daily', { count: 1 });
		const next = nextOccurrence(r as string, new Date('2030-01-01'));
		expect(next).toBeNull();
	});
});
