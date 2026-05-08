/**
 * iCloud CalDAV reader. Optional — if no credentials configured, returns [].
 * Cached for 60s to avoid hammering iCloud on every page load.
 */
import { createDAVClient, type DAVCalendar, type DAVObject } from 'tsdav';

export type CalEvent = {
	uid: string;
	calendar: string;
	color: string | null;
	summary: string;
	start: Date;
	end: Date;
	allDay: boolean;
};

let cache: { at: number; events: CalEvent[] } | null = null;
const TTL = 60_000;

function configured(): { username: string; password: string } | null {
	const username = process.env.ICLOUD_USERNAME;
	const password = process.env.ICLOUD_APP_PASSWORD;
	if (!username || !password) return null;
	return { username, password };
}

function parseICSDate(value: string): { date: Date; allDay: boolean } {
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
		return { date: new Date(ms - (z ? 0 : new Date().getTimezoneOffset() * 60_000)), allDay: false };
	}
	return { date: new Date(value), allDay: false };
}

function parseICS(ics: string, calendarName: string, color: string | null): CalEvent[] {
	const events: CalEvent[] = [];
	const blocks = ics.split('BEGIN:VEVENT').slice(1);
	for (const block of blocks) {
		const body = block.split('END:VEVENT')[0];
		const lines = body.replace(/\r\n[ \t]/g, '').split(/\r?\n/);
		const get = (key: string) => {
			const line = lines.find((l) => l.startsWith(key + ':') || l.startsWith(key + ';'));
			if (!line) return null;
			const idx = line.indexOf(':');
			return idx === -1 ? null : line.slice(idx + 1).trim();
		};
		const uid = get('UID') ?? cryptoRandom();
		const summary = get('SUMMARY') ?? '(no title)';
		const dtstartLine = lines.find((l) => l.startsWith('DTSTART'));
		const dtendLine = lines.find((l) => l.startsWith('DTEND'));
		if (!dtstartLine) continue;
		const start = parseICSDate(dtstartLine.slice(dtstartLine.indexOf(':') + 1).trim());
		const end = dtendLine
			? parseICSDate(dtendLine.slice(dtendLine.indexOf(':') + 1).trim())
			: { date: new Date(start.date.getTime() + 60 * 60_000), allDay: start.allDay };
		events.push({
			uid,
			calendar: calendarName,
			color,
			summary,
			start: start.date,
			end: end.date,
			allDay: start.allDay
		});
	}
	return events;
}

function cryptoRandom() {
	return Math.random().toString(36).slice(2);
}

export async function fetchEvents(rangeStart: Date, rangeEnd: Date): Promise<CalEvent[]> {
	const creds = configured();
	if (!creds) return [];
	if (cache && Date.now() - cache.at < TTL) return cache.events;

	try {
		const client = await createDAVClient({
			serverUrl: 'https://caldav.icloud.com',
			credentials: creds,
			authMethod: 'Basic',
			defaultAccountType: 'caldav'
		});
		const calendars = (await client.fetchCalendars()) as DAVCalendar[];
		const out: CalEvent[] = [];
		for (const cal of calendars) {
			const objects = (await client.fetchCalendarObjects({
				calendar: cal,
				timeRange: {
					start: rangeStart.toISOString(),
					end: rangeEnd.toISOString()
				}
			})) as DAVObject[];
			for (const obj of objects) {
				if (typeof obj.data === 'string') {
					out.push(
						...parseICS(
							obj.data,
							cal.displayName as string,
							(cal as unknown as { calendarColor?: string }).calendarColor ?? null
						)
					);
				}
			}
		}
		cache = { at: Date.now(), events: out };
		return out;
	} catch (err) {
		console.error('CalDAV fetch failed:', err);
		return [];
	}
}
