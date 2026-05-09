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
	start: Date;
	end: Date;
	allDay: boolean;
};

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; events: Omit<CalEvent, 'feedId'>[] }>();

function parseIcsDate(value: string): { date: Date; allDay: boolean } {
	// VALUE=DATE → all-day, format YYYYMMDD
	if (/^\d{8}$/.test(value)) {
		const y = +value.slice(0, 4);
		const m = +value.slice(4, 6) - 1;
		const d = +value.slice(6, 8);
		return { date: new Date(Date.UTC(y, m, d)), allDay: true };
	}
	// 20260514T120000Z or 20260514T120000
	const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
	if (m) {
		const [, y, mo, d, h, mi, s, z] = m;
		const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
		// If no Z suffix the time is in the publisher's local TZ. We can't know
		// what TZ that is from the line alone (that lives in TZID/VTIMEZONE),
		// so for the kiosk we treat naive times as the server's local TZ — a
		// pragmatic shortcut that matches "publisher and reader live in the
		// same household" for our use case.
		return {
			date: new Date(ms - (z ? 0 : new Date().getTimezoneOffset() * 60_000)),
			allDay: false
		};
	}
	return { date: new Date(value), allDay: false };
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
		const get = (key: string) => {
			const line = lines.find((l) => l.startsWith(key + ':') || l.startsWith(key + ';'));
			if (!line) return null;
			const idx = line.indexOf(':');
			return idx === -1 ? null : line.slice(idx + 1).trim();
		};
		const uid = get('UID') ?? Math.random().toString(36).slice(2);
		const summary = get('SUMMARY') ?? '(no title)';
		const dtstartLine = lines.find((l) => l.startsWith('DTSTART'));
		const dtendLine = lines.find((l) => l.startsWith('DTEND'));
		if (!dtstartLine) continue;
		const start = parseIcsDate(dtstartLine.slice(dtstartLine.indexOf(':') + 1).trim());
		const end = dtendLine
			? parseIcsDate(dtendLine.slice(dtendLine.indexOf(':') + 1).trim())
			: { date: new Date(start.date.getTime() + 60 * 60_000), allDay: start.allDay };
		events.push({
			uid,
			feedName,
			color,
			summary,
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
