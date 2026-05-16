CREATE TABLE `calendar_feeds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`color` text DEFAULT 'blue' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `calendar_feeds_user_idx` ON `calendar_feeds` (`user_id`);--> statement-breakpoint
CREATE TABLE `checklist_tags` (
	`checklist_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`checklist_id`, `tag_id`),
	FOREIGN KEY (`checklist_id`) REFERENCES `checklists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_tags_tag_idx` ON `checklist_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `checklists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`emoji` text DEFAULT '📋' NOT NULL,
	`items` text NOT NULL,
	`default_priority` integer DEFAULT 0 NOT NULL,
	`default_due_time` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `grocery_item_tags` (
	`grocery_item_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`grocery_item_id`, `tag_id`),
	FOREIGN KEY (`grocery_item_id`) REFERENCES `grocery_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `grocery_item_tags_tag_idx` ON `grocery_item_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `grocery_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`amount` integer DEFAULT 1 NOT NULL,
	`store_id` integer,
	`last_purchased_at` integer,
	`added_by_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`added_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `grocery_store_idx` ON `grocery_items` (`store_id`);--> statement-breakpoint
CREATE INDEX `grocery_last_purchased_idx` ON `grocery_items` (`last_purchased_at`);--> statement-breakpoint
CREATE TABLE `grocery_purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`grocery_item_id` integer,
	`name_snapshot` text NOT NULL,
	`store_id` integer,
	`amount` integer DEFAULT 1 NOT NULL,
	`purchased_at` integer NOT NULL,
	`purchased_by_id` integer,
	FOREIGN KEY (`grocery_item_id`) REFERENCES `grocery_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`purchased_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `grocery_purchases_item_idx` ON `grocery_purchases` (`grocery_item_id`);--> statement-breakpoint
CREATE INDEX `grocery_purchases_purchased_at_idx` ON `grocery_purchases` (`purchased_at`);--> statement-breakpoint
CREATE TABLE `lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'blue' NOT NULL,
	`owner_id` integer,
	`kind` text DEFAULT 'chores' NOT NULL,
	`system` text DEFAULT 'none' NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lists_owner_idx` ON `lists` (`owner_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `stores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`emoji` text DEFAULT '🛒' NOT NULL,
	`color` text DEFAULT 'blue' NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`scope` text DEFAULT 'task' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_scope_idx` ON `tags` (`name`,`scope`);--> statement-breakpoint
CREATE TABLE `task_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer,
	`title_snapshot` text NOT NULL,
	`list_id_snapshot` integer,
	`series_id_snapshot` integer,
	`completed_at` integer NOT NULL,
	`completed_by` integer,
	`due_at_at_completion` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `task_completions_task_idx` ON `task_completions` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_completions_series_idx` ON `task_completions` (`series_id_snapshot`);--> statement-breakpoint
CREATE INDEX `task_completions_completed_idx` ON `task_completions` (`completed_at`);--> statement-breakpoint
CREATE TABLE `task_tags` (
	`task_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`task_id`, `tag_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_tags_tag_idx` ON `task_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`assignee_id` integer,
	`title` text NOT NULL,
	`notes` text,
	`due_at` integer,
	`due_has_time` integer DEFAULT false NOT NULL,
	`rrule` text,
	`recur_from_completion` integer DEFAULT false NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`completed_by` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_list_idx` ON `tasks` (`list_id`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_idx` ON `tasks` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `tasks_due_idx` ON `tasks` (`due_at`);--> statement-breakpoint
CREATE INDEX `tasks_completed_idx` ON `tasks` (`completed_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'blue' NOT NULL,
	`emoji` text DEFAULT '🙂' NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
