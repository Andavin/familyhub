// Client-safe wrappers around rrule. Mirrors $lib/server/recurrence.ts but is
// importable from .svelte components (no $lib/server boundary violation).

import { RRule, type Options } from 'rrule';

export function buildRrule(
	freq: 'daily' | 'weekly' | 'monthly' | 'yearly' | null,
	opts: { interval?: number; byweekday?: number[]; count?: number; until?: Date } = {}
): string | null {
	if (!freq) return null;
	const freqMap: Record<string, Options['freq']> = {
		daily: RRule.DAILY,
		weekly: RRule.WEEKLY,
		monthly: RRule.MONTHLY,
		yearly: RRule.YEARLY
	};
	const rule = new RRule({
		freq: freqMap[freq],
		interval: opts.interval ?? 1,
		byweekday: opts.byweekday,
		count: opts.count,
		until: opts.until
	});
	return rule.toString();
}

export function describeRrule(rrule: string): string {
	try {
		return RRule.fromString(rrule).toText();
	} catch {
		return rrule;
	}
}
