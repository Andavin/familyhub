// Client-safe wrappers around rrule. Mirrors $lib/server/recurrence.ts but is
// importable from .svelte components (no $lib/server boundary violation).

// rrule ships dual CJS/ESM and the named export shape differs between Vite's
// dev SSR (Node CJS) and the browser ESM bundle. Importing as a namespace and
// digging out `RRule` works in both.
import * as rruleNs from 'rrule';
type Options = rruleNs.Options;
const RRule = (rruleNs as { RRule?: typeof rruleNs.RRule; default?: { RRule: typeof rruleNs.RRule } })
	.RRule ?? (rruleNs as unknown as { default: { RRule: typeof rruleNs.RRule } }).default.RRule;

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
