/**
 * Public iCal (.ics) subscription fetcher + parser.
 *
 * Public Calendar URLs from iCloud / Google / Outlook / Fastmail all serve
 * the standard iCalendar format. Read-only: the URL is the credential.
 *
 * In-memory TTL cache keyed by URL — Public Calendar publishers typically
 * refresh on a 5-minute granularity anyway, so polling more often is wasted.
 *
 * Recurrence: VEVENTs with RRULE/EXDATE are stored unexpanded in the cache
 * and projected to occurrences within the visible grid via expandEvents().
 * That keeps the cache cheap (one row per master event) while letting the
 * same fetched data serve any month view.
 */

import rrulePkg from 'rrule';
const { RRule } = rrulePkg;
type RRuleOptions = rrulePkg.Options;

export type CalEvent = {
	uid: string;
	feedId: number;
	feedName: string;
	color: string | null;
	summary: string;
	location: string | null;
	description: string | null;
	start: Date;
	end: Date;
	allDay: boolean;
};

export type RawEvent = Omit<CalEvent, 'feedId'> & {
	rrule: string | null;
	exdates: number[]; // ms timestamps
};

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; events: RawEvent[] }>();

function zonedToUtc(
	y: number,
	mo: number,
	d: number,
	h: number,
	mi: number,
	s: number,
	tzid: string
): Date | null {
	const guess = Date.UTC(y, mo, d, h, mi, s);
	let fmt: Intl.DateTimeFormat;
	try {
		fmt = new Intl.DateTimeFormat('en-US', {
			timeZone: tzid,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});
	} catch {
		return null;
	}
	const parts = fmt.formatToParts(new Date(guess)).reduce<Record<string, string>>((a, p) => {
		if (p.type !== 'literal') a[p.type] = p.value;
		return a;
	}, {});
	const asLocal = Date.UTC(
		+parts.year,
		+parts.month - 1,
		+parts.day,
		parts.hour === '24' ? 0 : +parts.hour,
		+parts.minute,
		+parts.second
	);
	const offset = asLocal - guess;
	return new Date(guess - offset);
}

function parseIcsDate(value: string, tzid: string | null): { date: Date; allDay: boolean } {
	if (/^\d{8}$/.test(value)) {
		const y = +value.slice(0, 4);
		const m = +value.slice(4, 6) - 1;
		const d = +value.slice(6, 8);
		return { date: new Date(Date.UTC(y, m, d)), allDay: true };
	}
	const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
	if (m) {
		const [, y, mo, d, h, mi, s, z] = m;
		const Y = +y;
		const Mo = +mo - 1;
		const D = +d;
		const H = +h;
		const Mi = +mi;
		const S = +s;
		if (z) {
			return { date: new Date(Date.UTC(Y, Mo, D, H, Mi, S)), allDay: false };
		}
		if (tzid) {
			const zoned = zonedToUtc(Y, Mo, D, H, Mi, S, tzid);
			if (zoned) return { date: zoned, allDay: false };
		}
		return { date: new Date(Y, Mo, D, H, Mi, S), allDay: false };
	}
	return { date: new Date(value), allDay: false };
}

function getParam(line: string, name: string): string | null {
	const colon = line.indexOf(':');
	const head = colon === -1 ? line : line.slice(0, colon);
	const re = new RegExp(`(?:^|;)${name}=([^;:]+)`, 'i');
	const m = head.match(re);
	if (!m) return null;
	return m[1].replace(/^"(.*)"$/, '$1');
}

function unescapeText(s: string | null): string | null {
	if (!s) return s;
	return s
		.replace(/\\n/gi, '\n')
		.replace(/\\,/g, ',')
		.replace(/\\;/g, ';')
		.replace(/\\\\/g, '\\');
}

export function parseIcs(ics: string, feedName: string, color: string | null): RawEvent[] {
	const events: RawEvent[] = [];
	const blocks = ics.split('BEGIN:VEVENT').slice(1);
	for (const block of blocks) {
		const body = block.split('END:VEVENT')[0];
		const unfolded = body.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
		const lines = unfolded.split(/\r?\n/);
		const findLine = (key: string) =>
			lines.find((l) => l.startsWith(key + ':') || l.startsWith(key + ';')) ?? null;
		const findAll = (key: string) =>
			lines.filter((l) => l.startsWith(key + ':') || l.startsWith(key + ';'));
		const valueOf = (line: string | null) => {
			if (!line) return null;
			const idx = line.indexOf(':');
			return idx === -1 ? null : line.slice(idx + 1).trim();
		};

		const uid = valueOf(findLine('UID')) ?? Math.random().toString(36).slice(2);
		const summary = valueOf(findLine('SUMMARY')) ?? '(no title)';
		const location = unescapeText(valueOf(findLine('LOCATION')));
		const description = unescapeText(valueOf(findLine('DESCRIPTION')));

		const dtstartLine = findLine('DTSTART');
		const dtendLine = findLine('DTEND');
		if (!dtstartLine) continue;
		const startTzid = getParam(dtstartLine, 'TZID');
		const endTzid = dtendLine ? getParam(dtendLine, 'TZID') : null;

		const start = parseIcsDate(valueOf(dtstartLine) as string, startTzid);
		const end = dtendLine
			? parseIcsDate(valueOf(dtendLine) as string, endTzid)
			: { date: new Date(start.date.getTime() + 60 * 60_000), allDay: start.allDay };

		const rruleLine = findLine('RRULE');
		const rrule = valueOf(rruleLine);

		// EXDATE may appear multiple times, comma-separated values per line.
		const exdates: number[] = [];
		for (const ex of findAll('EXDATE')) {
			const tzid = getParam(ex, 'TZID');
			const v = valueOf(ex);
			if (!v) continue;
			for (const part of v.split(',')) {
				const trimmed = part.trim();
				if (!trimmed) continue;
				const parsed = parseIcsDate(trimmed, tzid);
				exdates.push(parsed.date.getTime());
			}
		}

		events.push({
			uid,
			feedName,
			color,
			summary: unescapeText(summary) ?? summary,
			location,
			description,
			start: start.date,
			end: end.date,
			allDay: start.allDay,
			rrule,
			exdates
		});
	}
	return events;
}

/**
 * Expand any RRULE-bearing events to one entry per occurrence within
 * [rangeStart, rangeEnd]. Non-recurring events pass through. Each occurrence
 * inherits the original event's metadata; only `start` and `end` change
 * (preserving DTEND-DTSTART duration).
 *
 * EXDATEs are honored. RDATE / RECURRENCE-ID overrides are not yet
 * supported — those are needed for one-off edits to a series.
 */
export function expandEvents(
	raw: RawEvent[],
	rangeStart: Date,
	rangeEnd: Date,
	maxPerEvent = 200
): Omit<CalEvent, 'feedId'>[] {
	const out: Omit<CalEvent, 'feedId'>[] = [];
	for (const ev of raw) {
		if (!ev.rrule) {
			const { rrule: _r, exdates: _e, ...rest } = ev;
			out.push(rest);
			continue;
		}
		let parsed: ReturnType<typeof RRule.fromString>;
		try {
			parsed = RRule.fromString(ev.rrule);
		} catch (err) {
			console.error('[ics] failed to parse RRULE', ev.rrule, err);
			const { rrule: _r, exdates: _e, ...rest } = ev;
			out.push(rest);
			continue;
		}
		const opts: Partial<RRuleOptions> = { ...parsed.origOptions, dtstart: ev.start };
		const rule = new RRule(opts);
		// Pad start by the event duration so events that begin before the
		// range but overlap it still surface.
		const duration = ev.end.getTime() - ev.start.getTime();
		const lower = new Date(rangeStart.getTime() - duration);
		const occurrences = rule.between(lower, rangeEnd, true).slice(0, maxPerEvent);
		const exSet = new Set(ev.exdates);
		const { rrule: _r, exdates: _e, ...rest } = ev;
		for (const occ of occurrences) {
			if (exSet.has(occ.getTime())) continue;
			out.push({
				...rest,
				start: occ,
				end: new Date(occ.getTime() + duration)
			});
		}
	}
	return out;
}

export async function fetchIcsFeed(
	url: string,
	feedName: string,
	color: string | null
): Promise<RawEvent[]> {
	const key = url;
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.events;

	const httpUrl = url.replace(/^webcal:\/\//i, 'https://');
	try {
		const res = await fetch(httpUrl, {
			headers: { 'user-agent': 'family-hub/1.0' },
			redirect: 'follow'
		});
		if (!res.ok) {
			console.error(`[ics] ${res.status} ${httpUrl}`);
			return hit?.events ?? [];
		}
		const text = await res.text();
		const events = parseIcs(text, feedName, color);
		cache.set(key, { at: Date.now(), events });
		return events;
	} catch (err) {
		console.error('[ics] fetch failed:', httpUrl, err);
		return hit?.events ?? [];
	}
}

export function clearIcsCache() {
	cache.clear();
}
