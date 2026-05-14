import { describe, it, expect } from 'vitest';
import { normalizeTagName } from './tags';

describe('normalizeTagName', () => {
	it('strips leading hash characters', () => {
		expect(normalizeTagName('#cleaning')).toBe('cleaning');
		expect(normalizeTagName('##weird')).toBe('weird');
	});

	it('lowercases so case variants collide', () => {
		expect(normalizeTagName('Cleaning')).toBe('cleaning');
		expect(normalizeTagName('CLEANING')).toBe('cleaning');
	});

	it('trims surrounding whitespace', () => {
		expect(normalizeTagName('  travel  ')).toBe('travel');
	});

	it('returns empty string for blank input so callers can skip', () => {
		expect(normalizeTagName('')).toBe('');
		expect(normalizeTagName('   ')).toBe('');
		expect(normalizeTagName('#')).toBe('');
	});
});
