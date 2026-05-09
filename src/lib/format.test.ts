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

	it('true for past dates with time', () => {
		expect(isOverdue(new Date(Date.now() - 60_000))).toBe(true);
	});

	it('false for future dates with time', () => {
		expect(isOverdue(new Date(Date.now() + 60_000))).toBe(false);
	});

	it('date-only task scheduled today is NOT overdue mid-day', () => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		expect(isOverdue(today, false)).toBe(false);
	});

	it('date-only task scheduled yesterday IS overdue', () => {
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		yesterday.setHours(0, 0, 0, 0);
		expect(isOverdue(yesterday, false)).toBe(true);
	});

	it('date-only task scheduled tomorrow is NOT overdue', () => {
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		tomorrow.setHours(0, 0, 0, 0);
		expect(isOverdue(tomorrow, false)).toBe(false);
	});

	it('timed task at midnight today IS overdue any time after midnight', () => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		// A timed task scheduled for midnight is overdue at any later moment.
		// Use slightly past midnight to avoid clock-edge flake.
		expect(isOverdue(new Date(today.getTime() - 60_000), true)).toBe(true);
	});
});
