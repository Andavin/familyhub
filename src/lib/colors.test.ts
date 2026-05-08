import { describe, it, expect } from 'vitest';
import { colorVar, LIST_COLORS } from './colors';

describe('colorVar', () => {
	it('maps known colors to css vars', () => {
		expect(colorVar('blue')).toBe('var(--color-list-blue)');
		expect(colorVar('red')).toBe('var(--color-list-red)');
	});
	it('defaults to blue for unknown', () => {
		expect(colorVar('chartreuse')).toBe('var(--color-list-blue)');
	});
	it('exports >= 12 colors', () => {
		expect(LIST_COLORS.length).toBeGreaterThanOrEqual(12);
	});
});
