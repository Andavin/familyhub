import { describe, it, expect } from 'vitest';
import { formatDueLabel, isOverdue } from './format';

describe('formatDueLabel', () => {
	it('returns empty string for null', () => {
		expect(formatDueLabel(null)).toBe('');
		expect(formatDueLabel(undefined)).toBe('');
	});

	it('formats today', () => {
		const d = new Date();
		d.setHours(15, 30, 0, 0);
		expect(formatDueLabel(d)).toMatch(/Today/);
	});

	it('formats today with no time as just "Today"', () => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		expect(formatDueLabel(d)).toBe('Today');
	});

	it('formats tomorrow', () => {
		const d = new Date();
		d.setDate(d.getDate() + 1);
		d.setHours(9, 0, 0, 0);
		expect(formatDueLabel(d)).toMatch(/Tomorrow/);
	});
});

describe('isOverdue', () => {
	it('false for null/undefined', () => {
		expect(isOverdue(null)).toBe(false);
		expect(isOverdue(undefined)).toBe(false);
	});

	it('true for past dates', () => {
		expect(isOverdue(new Date(Date.now() - 60_000))).toBe(true);
	});

	it('false for future dates', () => {
		expect(isOverdue(new Date(Date.now() + 60_000))).toBe(false);
	});
});
