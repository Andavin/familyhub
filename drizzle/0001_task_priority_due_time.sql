ALTER TABLE `tasks` ADD `due_has_time` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `priority` integer DEFAULT 0 NOT NULL;