import { describe, it, expect } from 'vitest';
import { categorize, CATEGORIES } from './grocery';

describe('grocery categorize', () => {
	it.each([
		['milk', 'Dairy & Eggs'],
		['Whole Milk', 'Dairy & Eggs'],
		['eggs', 'Dairy & Eggs'],
		['banana', 'Produce'],
		['fresh basil', 'Produce'],
		['ground beef', 'Meat & Seafood'],
		['chicken breast', 'Meat & Seafood'],
		['sourdough bread', 'Bakery'],
		['frozen pizza', 'Frozen'],
		['frozen', 'Frozen'],
		['olive oil', 'Pantry'],
		['black beans', 'Pantry'],
		['sparkling water', 'Beverages'],
		['paper towels', 'Household'],
		['shampoo', 'Personal Care'],
		['weird unknown product xyz', 'Other']
	])('categorizes "%s" as %s', (name, cat) => {
		expect(categorize(name)).toBe(cat);
	});

	it('all categories are valid', () => {
		for (const c of CATEGORIES) {
			expect(typeof c).toBe('string');
		}
	});

	it('empty input returns Other', () => {
		expect(categorize('')).toBe('Other');
		expect(categorize('   ')).toBe('Other');
	});

	it('prefers more specific match (longer keyword wins)', () => {
		// "ice cream" should beat "cream" → Frozen wins over Dairy & Eggs
		expect(categorize('vanilla ice cream')).toBe('Frozen');
	});
});
