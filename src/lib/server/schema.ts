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
		// Set when a non-recurring task is checked off, OR when a recurring
		// series has run out of occurrences and ends. Recurring tasks with
		// remaining occurrences keep this null and instead advance dueAt
		// while logging to task_completions.
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

/**
 * Completion log for recurring tasks. Each time a recurring task is
 * checked off, we append a row here recording when it was completed and
 * what the dueAt was at that moment — that lets us rewind on uncomplete
 * without needing to reverse-compute the rrule.
 */
export const taskCompletions = sqliteTable(
	'task_completions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		// Nullable so the row survives if the parent task is deleted.
		taskId: integer('task_id').references(() => tasks.id, { onDelete: 'set null' }),
		// Snapshots taken at completion time so orphan rows still render and
		// stay grouped under the right list after the parent task is deleted.
		titleSnapshot: text('title_snapshot').notNull(),
		listIdSnapshot: integer('list_id_snapshot'),
		// Stable identifier for the recurring series. Mirrors `taskId` at
		// completion time, but unlike `taskId` it is NOT nulled when the
		// parent task row is deleted — so streak / count queries that span
		// a delete still group correctly. Pre-existing rows may be null.
		seriesIdSnapshot: integer('series_id_snapshot'),
		completedAt: integer('completed_at', { mode: 'timestamp_ms' }).notNull(),
		completedBy: integer('completed_by').references(() => users.id, { onDelete: 'set null' }),
		dueAtAtCompletion: integer('due_at_at_completion', { mode: 'timestamp_ms' })
	},
	(t) => ({
		taskIdx: index('task_completions_task_idx').on(t.taskId),
		seriesIdx: index('task_completions_series_idx').on(t.seriesIdSnapshot),
		completedIdx: index('task_completions_completed_idx').on(t.completedAt)
	})
);

export type TaskCompletion = typeof taskCompletions.$inferSelect;

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

/**
 * Public iCal subscription URL bound to a user (or null for shared / nobody).
 * Pulled read-only on each Calendar page load. The URL is the credential —
 * keep it secret, regenerate by toggling Public off/on in the source app.
 */
export const calendarFeeds = sqliteTable(
	'calendar_feeds',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		url: text('url').notNull(),
		color: text('color').notNull().default('blue'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch() * 1000)`)
	},
	(t) => ({
		userIdx: index('calendar_feeds_user_idx').on(t.userId)
	})
);

export type CalendarFeed = typeof calendarFeeds.$inferSelect;

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
