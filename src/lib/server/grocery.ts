// Heuristic categorization mirroring Apple Reminders' Groceries auto-sort.
import { CATEGORIES, type Category } from '$lib/categories';
export { CATEGORIES, type Category };

const KEYWORDS: Record<Category, string[]> = {
	Produce: [
		'apple', 'banana', 'lettuce', 'tomato', 'onion', 'potato', 'carrot', 'spinach',
		'pepper', 'cucumber', 'avocado', 'lemon', 'lime', 'orange', 'berries', 'strawberry',
		'blueberry', 'raspberry', 'grape', 'broccoli', 'cauliflower', 'celery', 'garlic',
		'ginger', 'mushroom', 'herbs', 'parsley', 'cilantro', 'basil', 'kale', 'arugula',
		'salad', 'fruit', 'vegetable', 'corn', 'zucchini', 'squash', 'mango', 'pineapple'
	],
	'Dairy & Eggs': [
		'milk', 'cheese', 'butter', 'yogurt', 'cream', 'egg', 'eggs', 'sour cream',
		'cottage cheese', 'half and half', 'half-and-half', 'feta', 'mozzarella', 'cheddar',
		'parmesan', 'kefir', 'oat milk', 'almond milk', 'soy milk'
	],
	'Meat & Seafood': [
		'chicken', 'beef', 'pork', 'bacon', 'sausage', 'ham', 'turkey', 'lamb', 'salmon',
		'tuna', 'shrimp', 'fish', 'meat', 'steak', 'ground beef', 'ribs', 'cod', 'tilapia'
	],
	Bakery: [
		'bread', 'bagel', 'muffin', 'croissant', 'baguette', 'roll', 'tortilla', 'pita',
		'bun', 'donut', 'cake', 'pastry', 'pie', 'cookie'
	],
	Frozen: [
		'ice cream', 'frozen', 'pizza', 'frozen pizza', 'frozen veg', 'popsicle', 'gelato',
		'frozen fruit', 'frozen meal'
	],
	Pantry: [
		'flour', 'sugar', 'salt', 'pepper', 'oil', 'olive oil', 'vinegar', 'pasta',
		'rice', 'beans', 'lentil', 'cereal', 'oats', 'oatmeal', 'sauce', 'ketchup',
		'mustard', 'mayo', 'mayonnaise', 'soy sauce', 'honey', 'syrup', 'peanut butter',
		'jam', 'jelly', 'cracker', 'canned', 'soup', 'broth', 'stock', 'spice', 'seasoning',
		'baking', 'yeast'
	],
	Beverages: [
		'water', 'soda', 'juice', 'coffee', 'tea', 'beer', 'wine', 'sparkling', 'lacroix',
		'la croix', 'gatorade', 'lemonade', 'energy drink', 'kombucha'
	],
	Snacks: [
		'chips', 'pretzel', 'popcorn', 'candy', 'chocolate', 'gum', 'nuts', 'almonds',
		'peanuts', 'cashew', 'trail mix', 'granola bar', 'protein bar', 'crackers'
	],
	Household: [
		'paper towel', 'toilet paper', 'tp', 'tissues', 'kleenex', 'detergent', 'soap',
		'dish soap', 'sponge', 'trash bag', 'foil', 'plastic wrap', 'ziploc', 'bleach',
		'cleaner', 'laundry', 'fabric softener', 'lightbulb', 'batteries'
	],
	'Personal Care': [
		'shampoo', 'conditioner', 'body wash', 'lotion', 'sunscreen', 'deodorant',
		'toothpaste', 'toothbrush', 'floss', 'mouthwash', 'razor', 'shaving', 'tampons',
		'pads', 'bandaid', 'band-aid', 'aspirin', 'ibuprofen', 'tylenol', 'vitamin'
	],
	Other: []
};

export function categorize(name: string): Category {
	const n = name.toLowerCase().trim();
	if (!n) return 'Other';

	let best: { cat: Category; score: number } = { cat: 'Other', score: 0 };
	for (const cat of CATEGORIES) {
		for (const kw of KEYWORDS[cat]) {
			if (n === kw || n.includes(kw)) {
				// longer match wins (more specific)
				if (kw.length > best.score) best = { cat, score: kw.length };
			}
		}
	}
	return best.cat;
}
