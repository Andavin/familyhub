import { db } from './db';
import { users, lists, checklists } from './schema';

async function main() {
	const existing = await db.select().from(users);
	if (existing.length > 0) {
		console.log('Already seeded.');
		return;
	}

	const insertedUsers = await db
		.insert(users)
		.values([
			{ name: 'Mark', color: 'blue', emoji: '🧔', displayOrder: 0 },
			{ name: 'Partner', color: 'pink', emoji: '💁‍♀️', displayOrder: 1 },
			{ name: 'Kid', color: 'green', emoji: '🧒', displayOrder: 2 }
		])
		.returning();

	const ownedLists: Record<string, number> = {};
	for (const u of insertedUsers) {
		const [l] = await db
			.insert(lists)
			.values({
				name: `${u.name}'s Tasks`,
				color: u.color,
				ownerId: u.id,
				kind: 'chores',
				displayOrder: u.displayOrder
			})
			.returning();
		ownedLists[u.name] = l.id;
	}

	const [familyList] = await db
		.insert(lists)
		.values({ name: 'Family', color: 'orange', ownerId: null, kind: 'chores', displayOrder: 100 })
		.returning();

	await db.insert(lists).values({
		name: 'Groceries',
		color: 'green',
		ownerId: null,
		kind: 'grocery',
		displayOrder: 200
	});

	const markList = ownedLists.Mark;
	const partnerList = ownedLists.Partner;

	await db.insert(checklists).values([
		{
			name: 'Pre-Trip',
			emoji: '✈️',
			description: 'Everything we always need to do before leaving',
			items: [
				{ title: 'Pack chargers', listId: markList },
				{ title: 'Pack toiletries', listId: partnerList },
				{ title: 'Empty trash', listId: markList },
				{ title: 'Set thermostat to away', listId: markList },
				{ title: 'Water plants', listId: partnerList },
				{ title: 'Lock back door', listId: markList },
				{ title: 'Check passports', listId: familyList.id },
				{ title: 'Confirm flights', listId: markList },
				{ title: 'Stop mail hold', listId: partnerList }
			]
		},
		{
			name: 'Saturday Reset',
			emoji: '🧹',
			description: 'Weekly cleaning rotation',
			items: [
				{ title: 'Vacuum living room', listId: markList },
				{ title: 'Mop kitchen', listId: partnerList },
				{ title: 'Wash sheets', listId: familyList.id },
				{ title: 'Take out trash', listId: markList },
				{ title: 'Clean bathroom', listId: partnerList }
			]
		}
	]);

	console.log('Seeded.');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
