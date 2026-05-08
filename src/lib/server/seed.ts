import { db } from './db';
import { users, lists, templates } from './schema';

async function main() {
	const existing = await db.select().from(users);
	if (existing.length > 0) {
		console.log('Already seeded.');
		return;
	}

	const inserted = await db
		.insert(users)
		.values([
			{ name: 'Mark', color: 'blue', emoji: '🧔', displayOrder: 0 },
			{ name: 'Partner', color: 'pink', emoji: '💁‍♀️', displayOrder: 1 },
			{ name: 'Kid', color: 'green', emoji: '🧒', displayOrder: 2 }
		])
		.returning();

	for (const u of inserted) {
		await db.insert(lists).values({
			name: `${u.name}'s Tasks`,
			color: u.color,
			ownerId: u.id,
			kind: 'chores',
			displayOrder: u.displayOrder
		});
	}

	await db.insert(lists).values([
		{ name: 'Family', color: 'orange', ownerId: null, kind: 'chores', displayOrder: 100 },
		{ name: 'Groceries', color: 'green', ownerId: null, kind: 'grocery', displayOrder: 200 }
	]);

	await db.insert(templates).values([
		{
			name: 'Pre-Trip Checklist',
			emoji: '✈️',
			description: 'Everything we always need to do before leaving',
			items: [
				{ title: 'Pack chargers', assigneeRole: 'self' },
				{ title: 'Pack toiletries', assigneeRole: 'partner' },
				{ title: 'Empty trash', assigneeRole: 'self' },
				{ title: 'Set thermostat to away', assigneeRole: 'self' },
				{ title: 'Water plants', assigneeRole: 'partner' },
				{ title: 'Lock back door', assigneeRole: 'self' },
				{ title: 'Check passports', assigneeRole: 'shared' },
				{ title: 'Confirm flights', assigneeRole: 'self' },
				{ title: 'Stop mail hold', assigneeRole: 'partner' }
			]
		},
		{
			name: 'Saturday Reset',
			emoji: '🧹',
			description: 'Weekly cleaning rotation',
			items: [
				{ title: 'Vacuum living room', assigneeRole: 'self' },
				{ title: 'Mop kitchen', assigneeRole: 'partner' },
				{ title: 'Wash sheets', assigneeRole: 'shared' },
				{ title: 'Take out trash', assigneeRole: 'self' },
				{ title: 'Clean bathroom', assigneeRole: 'partner' }
			]
		}
	]);

	console.log('Seeded.');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
