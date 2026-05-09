import { describe, it, expect } from 'vitest';
import { parseIcs } from './ics';

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
DTSTART;TZID=America/Denver:20260509T040000
DTEND;TZID=America/Denver:20260509T050000
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
		// 4 AM Denver in May 2026 = MDT (UTC-6) → 10 AM UTC
		expect(e!.start.toISOString()).toBe('2026-05-09T10:00:00.000Z');
		expect(e!.end.toISOString()).toBe('2026-05-09T11:00:00.000Z');
	});

	it('attaches feedName + color to every event', () => {
		const events = parseIcs(SAMPLE, 'Mark — Personal', 'pink');
		expect(events.length).toBeGreaterThan(0);
		for (const e of events) {
			expect(e.feedName).toBe('Mark — Personal');
			expect(e.color).toBe('pink');
		}
	});

	it('returns [] for empty input', () => {
		expect(parseIcs('', 'X', 'blue')).toEqual([]);
	});
});
