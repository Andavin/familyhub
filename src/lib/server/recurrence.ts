import rrulePkg from 'rrule';
const { RRule } = rrulePkg;
type Options = rrulePkg.Options;

/**
 * Given a recurrence pattern (FREQ=...;INTERVAL=...) and the previous occurrence,
 * return the next occurrence — or null if the rule has run out (e.g. COUNT=1 already met).
 *
 * We always evaluate the rule with `dtstart = previous`, treating the recurrence pattern
 * as relative to the task's most recent due date. That mirrors how Apple Reminders advances
 * a repeating reminder when you check it off.
 */
export function nextOccurrence(rrule: string, previous: Date = new Date()): Date | null {
	const parsed = RRule.fromString(rrule);
	const opts: Partial<Options> = { ...parsed.origOptions, dtstart: previous };
	const rule = new RRule(opts);
	const next = rule.after(previous, false);
	return next ?? null;
}

/**
 * Build an RRULE string from common UI inputs. Returns null for "no repeat".
 */
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
