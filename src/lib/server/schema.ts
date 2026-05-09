import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	color: text('color').notNull().default('blue'),
	emoji: text('emoji').notNull().default('🙂'),
	displayOrder: integer('display_order').notNull().default(0),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`)
});

export const lists = sqliteTable(
	'lists',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		name: text('name').notNull(),
		color: text('color').notNull().default('blue'),
		ownerId: integer('owner_id').references(() => users.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: ['chores', 'grocery', 'general'] })
			.notNull()
			.default('chores'),
		// Marker for the auto-created "Unassigned" inbox list. System lists can't
		// be deleted from the UI and are excluded from list pickers.
		system: text('system').notNull().default('none'),
		displayOrder: integer('display_order').notNull().default(0)
	},
	(t) => ({
		ownerIdx: index('lists_owner_idx').on(t.ownerId)
	})
);

export const tasks = sqliteTable(
	'tasks',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		listId: integer('list_id')
			.notNull()
			.references(() => lists.id, { onDelete: 'cascade' }),
		assigneeId: integer('assignee_id').references(() => users.id, { onDelete: 'set null' }),
		title: text('title').notNull(),
		notes: text('notes'),
		dueAt: integer('due_at', { mode: 'timestamp_ms' }),
		dueHasTime: integer('due_has_time', { mode: 'boolean' }).notNull().default(false),
		rrule: text('rrule'),
		flagged: integer('flagged', { mode: 'boolean' }).notNull().default(false),
		priority: integer('priority').notNull().default(0),
		completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
		completedBy: integer('completed_by').references(() => users.id, { onDelete: 'set null' }),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch() * 1000)`)
	},
	(t) => ({
		listIdx: index('tasks_list_idx').on(t.listId),
		assigneeIdx: index('tasks_assignee_idx').on(t.assigneeId),
		dueIdx: index('tasks_due_idx').on(t.dueAt),
		completedIdx: index('tasks_completed_idx').on(t.completedAt)
	})
);

export type ChecklistItem = {
	title: string;
	listId: number; // which column the task lands in (deleted lists are pruned on delete)
	offsetDays?: number;
	notes?: string;
};

export const checklists = sqliteTable('checklists', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	description: text('description'),
	emoji: text('emoji').notNull().default('📋'),
	items: text('items', { mode: 'json' }).$type<ChecklistItem[]>().notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`)
});

export const groceryItems = sqliteTable(
	'grocery_items',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		name: text('name').notNull(),
		quantity: text('quantity'),
		category: text('category').notNull().default('Other'),
		checkedAt: integer('checked_at', { mode: 'timestamp_ms' }),
		addedById: integer('added_by_id').references(() => users.id, { onDelete: 'set null' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch() * 1000)`)
	},
	(t) => ({
		categoryIdx: index('grocery_category_idx').on(t.category),
		checkedIdx: index('grocery_checked_idx').on(t.checkedAt)
	})
);

export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => ({
		expiresIdx: uniqueIndex('sessions_expires_idx').on(t.expiresAt)
	})
);

export type User = typeof users.$inferSelect;
export type List = typeof lists.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Checklist = typeof checklists.$inferSelect;
export type GroceryItem = typeof groceryItems.$inferSelect;
