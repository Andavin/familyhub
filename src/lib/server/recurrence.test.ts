import { describe, it, expect } from 'vitest';
import {
	buildRrule,
	nextOccurrence,
	describeRrule,
	futureOccurrences,
	nextOccurrenceAfter
} from './recurrence';

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

describe('futureOccurrences', () => {
	it('projects daily rule into a 7-day window', () => {
		const r = buildRrule('daily') as string;
		const dtstart = new Date('2026-05-09T09:00:00Z');
		const occ = futureOccurrences(
			r,
			dtstart,
			new Date('2026-05-09T00:00:00Z'),
			new Date('2026-05-16T00:00:00Z')
		);
		expect(occ.length).toBeGreaterThanOrEqual(5);
		expect(occ.length).toBeLessThanOrEqual(7);
		expect(occ[0].getTime()).toBeGreaterThan(dtstart.getTime());
	});

	it('returns empty when range is before dtstart', () => {
		const r = buildRrule('daily') as string;
		const dtstart = new Date('2026-05-09T09:00:00Z');
		const occ = futureOccurrences(
			r,
			dtstart,
			new Date('2026-04-01T00:00:00Z'),
			new Date('2026-04-30T00:00:00Z')
		);
		expect(occ).toEqual([]);
	});

	it('returns empty for invalid rrule', () => {
		const occ = futureOccurrences('garbage', new Date(), new Date(), new Date());
		expect(occ).toEqual([]);
	});
});

describe('nextOccurrenceAfter', () => {
	it('weekly task overdue by 1 day → next is anchor + 7d (not now + 7d)', () => {
		const r = buildRrule('weekly') as string;
		const anchor = new Date('2026-05-08T09:00:00Z'); // Fri
		const now = new Date('2026-05-09T12:00:00Z'); // Sat (1d after anchor)
		const next = nextOccurrenceAfter(r, anchor, now);
		expect(next).not.toBeNull();
		// Following Friday at 9 UTC
		expect((next as Date).toISOString()).toBe('2026-05-15T09:00:00.000Z');
	});

	it('daily task overdue by 3 days → next is tomorrow at the same time', () => {
		const r = buildRrule('daily') as string;
		const anchor = new Date('2026-05-06T09:00:00Z');
		const now = new Date('2026-05-09T12:00:00Z');
		const next = nextOccurrenceAfter(r, anchor, now);
		expect(next).not.toBeNull();
		// Next on-grid instance strictly after now (9 May 12:00) is 10 May 09:00
		expect((next as Date).toISOString()).toBe('2026-05-10T09:00:00.000Z');
	});

	it('returns null for invalid rrule', () => {
		expect(nextOccurrenceAfter('garbage', new Date(), new Date())).toBeNull();
	});
});
