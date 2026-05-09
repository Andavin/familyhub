/**
 * Public iCal (.ics) subscription fetcher + parser.
 *
 * Public Calendar URLs from iCloud / Google / Outlook / Fastmail all serve
 * the standard iCalendar format. Read-only: the URL is the credential.
 *
 * In-memory TTL cache keyed by URL — Public Calendar publishers typically
 * refresh on a 5-minute granularity anyway, so polling more often is wasted.
 */

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

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; events: Omit<CalEvent, 'feedId'>[] }>();

/**
 * Compute the UTC instant for the given wall-clock components interpreted in
 * the named IANA timezone. Uses Intl.DateTimeFormat to round-trip and adjust;
 * one iteration handles DST cleanly except in the rare "fall-back" ambiguous
 * hour, which we resolve in favor of the earlier instant (matches Apple).
 */
function zonedToUtc(
	y: number,
	mo: number,
	d: number,
	h: number,
	mi: number,
	s: number,
	tzid: string
): Date {
	const guess = Date.UTC(y, mo, d, h, mi, s);
	const fmt = new Intl.DateTimeFormat('en-US', {
		timeZone: tzid,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});
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

function parseIcsDate(
	value: string,
	tzid: string | null
): { date: Date; allDay: boolean } {
	// VALUE=DATE → all-day, format YYYYMMDD
	if (/^\d{8}$/.test(value)) {
		const y = +value.slice(0, 4);
		const m = +value.slice(4, 6) - 1;
		const d = +value.slice(6, 8);
		return { date: new Date(Date.UTC(y, m, d)), allDay: true };
	}
	// 20260514T120000Z (UTC) or 20260514T120000 (TZID-scoped or floating local)
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
			return { date: zonedToUtc(Y, Mo, D, H, Mi, S, tzid), allDay: false };
		}
		// Floating local time — interpret in the server's timezone.
		return { date: new Date(Y, Mo, D, H, Mi, S), allDay: false };
	}
	return { date: new Date(value), allDay: false };
}

/**
 * Extract a parameter value from a property line, e.g.
 *   getParam("DTSTART;TZID=America/Denver;VALUE=DATE-TIME:...", "TZID")
 *   → "America/Denver"
 */
function getParam(line: string, name: string): string | null {
	const colon = line.indexOf(':');
	const head = colon === -1 ? line : line.slice(0, colon);
	const re = new RegExp(`(?:^|;)${name}=([^;:]+)`, 'i');
	const m = head.match(re);
	return m ? m[1] : null;
}

function unescapeText(s: string | null): string | null {
	if (!s) return s;
	return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

export function parseIcs(
	ics: string,
	feedName: string,
	color: string | null
): Omit<CalEvent, 'feedId'>[] {
	const events: Omit<CalEvent, 'feedId'>[] = [];
	const blocks = ics.split('BEGIN:VEVENT').slice(1);
	for (const block of blocks) {
		const body = block.split('END:VEVENT')[0];
		// RFC 5545 line-folding: a CRLF followed by space/tab continues the
		// previous line. Reverse it before scanning.
		const unfolded = body.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
		const lines = unfolded.split(/\r?\n/);
		const findLine = (key: string) =>
			lines.find((l) => l.startsWith(key + ':') || l.startsWith(key + ';')) ?? null;
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

		events.push({
			uid,
			feedName,
			color,
			summary: unescapeText(summary) ?? summary,
			location,
			description,
			start: start.date,
			end: end.date,
			allDay: start.allDay
		});
	}
	return events;
}

/**
 * Fetch + parse an ICS feed. Returns [] on any error (network, non-2xx,
 * malformed ICS) so a single bad feed never breaks the calendar page.
 *
 * webcal://example.com/foo.ics → https://example.com/foo.ics
 */
export async function fetchIcsFeed(
	url: string,
	feedName: string,
	color: string | null
): Promise<Omit<CalEvent, 'feedId'>[]> {
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
