import { describe, it, expect } from 'vitest';
import { parseIcs, expandEvents } from './ics';

const SAMPLE = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:abc-123
SUMMARY:Soccer practice
LOCATION:Field 4
DESCRIPTION:Bring water\\nand cleats
DTSTART:20260512T180000Z
DTEND:20260512T193000Z
END:VEVENT
BEGIN:VEVENT
UID:abc-456
SUMMARY:Anniversary
DTSTART;VALUE=DATE:20260601
DTEND;VALUE=DATE:20260602
END:VEVENT
BEGIN:VEVENT
UID:abc-789
SUMMARY:Long
 description with line
 folding per RFC 5545
DTSTART:20260513T090000Z
END:VEVENT
BEGIN:VEVENT
UID:tz-event
SUMMARY:Breakfast
DTSTART;TZID=America/New_York:20260509T040000
DTEND;TZID=America/New_York:20260509T050000
END:VEVENT
END:VCALENDAR`;

describe('parseIcs', () => {
	it('parses a timed VEVENT in UTC', () => {
		const events = parseIcs(SAMPLE, 'Test', 'blue');
		const e = events.find((x) => x.uid === 'abc-123');
		expect(e).toBeTruthy();
		expect(e!.summary).toBe('Soccer practice');
		expect(e!.allDay).toBe(false);
		expect(e!.start.toISOString()).toBe('2026-05-12T18:00:00.000Z');
		expect(e!.end.toISOString()).toBe('2026-05-12T19:30:00.000Z');
	});

	it('extracts LOCATION and unescapes DESCRIPTION newlines', () => {
		const events = parseIcs(SAMPLE, 'Test', 'blue');
		const e = events.find((x) => x.uid === 'abc-123');
		expect(e!.location).toBe('Field 4');
		expect(e!.description).toBe('Bring water\nand cleats');
	});

	it('parses an all-day VEVENT (DATE value)', () => {
		const events = parseIcs(SAMPLE, 'Test', 'blue');
		const e = events.find((x) => x.uid === 'abc-456');
		expect(e).toBeTruthy();
		expect(e!.allDay).toBe(true);
		expect(e!.summary).toBe('Anniversary');
	});

	it('handles RFC 5545 line folding (CRLF + space continuation)', () => {
		const events = parseIcs(SAMPLE, 'Test', 'blue');
		const e = events.find((x) => x.uid === 'abc-789');
		expect(e).toBeTruthy();
		expect(e!.summary).toBe('Longdescription with linefolding per RFC 5545');
	});

	it('synthesises end when DTEND missing (1h default)', () => {
		const events = parseIcs(SAMPLE, 'Test', 'blue');
		const e = events.find((x) => x.uid === 'abc-789');
		expect(e!.end.getTime() - e!.start.getTime()).toBe(60 * 60_000);
	});

	it('respects TZID parameter when present', () => {
		const events = parseIcs(SAMPLE, 'Test', 'blue');
		const e = events.find((x) => x.uid === 'tz-event');
		expect(e).toBeTruthy();
		// 4 AM New York in May 2026 = EDT (UTC-4) → 8 AM UTC
		expect(e!.start.toISOString()).toBe('2026-05-09T08:00:00.000Z');
		expect(e!.end.toISOString()).toBe('2026-05-09T09:00:00.000Z');
	});

	it('attaches feedName + color to every event', () => {
		const events = parseIcs(SAMPLE, 'Personal', 'pink');
		expect(events.length).toBeGreaterThan(0);
		for (const e of events) {
			expect(e.feedName).toBe('Personal');
			expect(e.color).toBe('pink');
		}
	});

	it('returns [] for empty input', () => {
		expect(parseIcs('', 'X', 'blue')).toEqual([]);
	});

	it('falls back to floating local on an invalid (non-IANA) TZID', () => {
		const ics = `BEGIN:VEVENT
UID:bad-tz
SUMMARY:Microsoft-style tz
DTSTART;TZID=Pacific Standard Time:20260509T040000
END:VEVENT`;
		const events = parseIcs(ics, 'Test', 'blue');
		expect(events).toHaveLength(1);
		// Falls back to floating local — wall clock 4 AM, in whatever the
		// server's tz is. We just check it didn't throw and produced a valid
		// Date.
		expect(events[0].start.getHours()).toBe(4);
	});

	it('strips quotes from TZID values per RFC 5545', () => {
		const ics = `BEGIN:VEVENT
UID:quoted
SUMMARY:Quoted tz
DTSTART;TZID="America/New_York":20260509T040000
END:VEVENT`;
		const events = parseIcs(ics, 'Test', 'blue');
		expect(events[0].start.toISOString()).toBe('2026-05-09T08:00:00.000Z');
	});

	it('captures RRULE and EXDATE on a recurring event', () => {
		const ics = `BEGIN:VEVENT
UID:weekly-1
SUMMARY:Standup
DTSTART:20260504T140000Z
DTEND:20260504T143000Z
RRULE:FREQ=WEEKLY;COUNT=10
EXDATE:20260518T140000Z
END:VEVENT`;
		const events = parseIcs(ics, 'Work', 'blue');
		expect(events).toHaveLength(1);
		expect(events[0].rrule).toBe('FREQ=WEEKLY;COUNT=10');
		expect(events[0].exdates).toEqual([
			new Date('2026-05-18T14:00:00.000Z').getTime()
		]);
	});
});

describe('expandEvents', () => {
	const baseRaw = {
		uid: 'rec-1',
		feedName: 'Work',
		color: 'blue',
		summary: 'Standup',
		location: null,
		description: null,
		allDay: false
	};

	it('non-recurring events pass through unchanged (with rrule/exdates stripped)', () => {
		const raw = [
			{
				...baseRaw,
				rrule: null,
				exdates: [],
				start: new Date('2026-05-09T14:00:00Z'),
				end: new Date('2026-05-09T14:30:00Z')
			}
		];
		const out = expandEvents(raw, new Date('2026-05-01'), new Date('2026-06-01'));
		expect(out).toHaveLength(1);
		expect(out[0]).not.toHaveProperty('rrule');
		expect(out[0].start.toISOString()).toBe('2026-05-09T14:00:00.000Z');
	});

	it('expands a weekly RRULE with COUNT inside the range', () => {
		const raw = [
			{
				...baseRaw,
				rrule: 'FREQ=WEEKLY;COUNT=4',
				exdates: [],
				start: new Date('2026-05-04T14:00:00Z'),
				end: new Date('2026-05-04T14:30:00Z')
			}
		];
		const out = expandEvents(raw, new Date('2026-05-01'), new Date('2026-06-01'));
		expect(out).toHaveLength(4);
		const isos = out.map((e) => e.start.toISOString());
		expect(isos).toEqual([
			'2026-05-04T14:00:00.000Z',
			'2026-05-11T14:00:00.000Z',
			'2026-05-18T14:00:00.000Z',
			'2026-05-25T14:00:00.000Z'
		]);
		// Duration preserved
		for (const e of out) {
			expect(e.end.getTime() - e.start.getTime()).toBe(30 * 60_000);
		}
	});

	it('honors EXDATE — excluded occurrence does not appear', () => {
		const raw = [
			{
				...baseRaw,
				rrule: 'FREQ=WEEKLY;COUNT=4',
				exdates: [new Date('2026-05-18T14:00:00Z').getTime()],
				start: new Date('2026-05-04T14:00:00Z'),
				end: new Date('2026-05-04T14:30:00Z')
			}
		];
		const out = expandEvents(raw, new Date('2026-05-01'), new Date('2026-06-01'));
		const isos = out.map((e) => e.start.toISOString());
		expect(isos).not.toContain('2026-05-18T14:00:00.000Z');
		expect(out).toHaveLength(3);
	});

	it('clips occurrences to the visible range', () => {
		const raw = [
			{
				...baseRaw,
				rrule: 'FREQ=DAILY;COUNT=30',
				exdates: [],
				start: new Date('2026-05-01T09:00:00Z'),
				end: new Date('2026-05-01T09:30:00Z')
			}
		];
		const out = expandEvents(raw, new Date('2026-05-10'), new Date('2026-05-15'));
		// 5 days from May 10 inclusive to May 15 exclusive: May 10, 11, 12, 13, 14
		expect(out.map((e) => e.start.toISOString().slice(0, 10))).toEqual([
			'2026-05-10',
			'2026-05-11',
			'2026-05-12',
			'2026-05-13',
			'2026-05-14'
		]);
	});

	it('all-day annual event recurs once per year', () => {
		const raw = [
			{
				...baseRaw,
				summary: 'Anniversary',
				rrule: 'FREQ=YEARLY',
				exdates: [],
				allDay: true,
				start: new Date(Date.UTC(2018, 5, 1)),
				end: new Date(Date.UTC(2018, 5, 2))
			}
		];
		const out = expandEvents(
			raw,
			new Date(Date.UTC(2026, 4, 1)),
			new Date(Date.UTC(2026, 5, 30))
		);
		expect(out).toHaveLength(1);
		expect(out[0].start.toISOString().slice(0, 10)).toBe('2026-06-01');
		expect(out[0].allDay).toBe(true);
	});

	it('falls back gracefully on garbage RRULE', () => {
		const raw = [
			{
				...baseRaw,
				rrule: 'NOT-A-VALID-RRULE',
				exdates: [],
				start: new Date('2026-05-09T14:00:00Z'),
				end: new Date('2026-05-09T14:30:00Z')
			}
		];
		const out = expandEvents(raw, new Date('2026-05-01'), new Date('2026-06-01'));
		// Falls back to the master event itself
		expect(out).toHaveLength(1);
		expect(out[0].start.toISOString()).toBe('2026-05-09T14:00:00.000Z');
	});
});
