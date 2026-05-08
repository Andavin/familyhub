export const CATEGORIES = [
	'Produce',
	'Dairy & Eggs',
	'Meat & Seafood',
	'Bakery',
	'Frozen',
	'Pantry',
	'Beverages',
	'Snacks',
	'Household',
	'Personal Care',
	'Other'
] as const;

export type Category = (typeof CATEGORIES)[number];
