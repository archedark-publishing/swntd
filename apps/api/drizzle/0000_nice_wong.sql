CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`uploaded_by_user_id` text NOT NULL,
	`storage_kind` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text,
	`storage_path` text,
	`external_url` text,
	`byte_size` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `attachments_task_id_idx` ON `attachments` (`task_id`);--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`body` text NOT NULL,
	`is_completed` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_items_task_id_idx` ON `checklist_items` (`task_id`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `comments_task_id_idx` ON `comments` (`task_id`);--> statement-breakpoint
CREATE TABLE `household_settings` (
	`household_id` text PRIMARY KEY NOT NULL,
	`done_archive_after_days` integer DEFAULT 30 NOT NULL,
	`default_timezone` text NOT NULL,
	`default_calendar_export_kind` text DEFAULT 'google' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `labels` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `labels_household_id_idx` ON `labels` (`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `labels_household_name_idx` ON `labels` (`household_id`,`name`);--> statement-breakpoint
CREATE TABLE `recurring_task_template_checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`recurring_task_template_id` text NOT NULL,
	`body` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`recurring_task_template_id`) REFERENCES `recurring_task_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recurring_task_template_checklist_items_template_id_idx` ON `recurring_task_template_checklist_items` (`recurring_task_template_id`);--> statement-breakpoint
CREATE TABLE `recurring_task_template_labels` (
	`recurring_task_template_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`recurring_task_template_id`, `label_id`),
	FOREIGN KEY (`recurring_task_template_id`) REFERENCES `recurring_task_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recurring_task_template_labels_label_id_idx` ON `recurring_task_template_labels` (`label_id`);--> statement-breakpoint
CREATE TABLE `recurring_task_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`default_assignee_user_id` text,
	`ai_assistance_enabled_default` integer DEFAULT false NOT NULL,
	`default_due_time` text,
	`recurrence_cadence` text NOT NULL,
	`recurrence_interval` integer DEFAULT 1 NOT NULL,
	`next_occurrence_on` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`default_assignee_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `recurring_task_templates_household_id_idx` ON `recurring_task_templates` (`household_id`);--> statement-breakpoint
CREATE INDEX `recurring_task_templates_next_occurrence_on_idx` ON `recurring_task_templates` (`next_occurrence_on`);--> statement-breakpoint
CREATE TABLE `service_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `service_tokens_user_id_idx` ON `service_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `task_events` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `task_events_task_id_idx` ON `task_events` (`task_id`);--> statement-breakpoint
CREATE TABLE `task_labels` (
	`task_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `label_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_labels_label_id_idx` ON `task_labels` (`label_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`recurring_task_template_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'To Do' NOT NULL,
	`assignee_user_id` text,
	`ai_assistance_enabled` integer DEFAULT false NOT NULL,
	`due_on` text,
	`due_time` text,
	`sort_key` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`archived_at` integer,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recurring_task_template_id`) REFERENCES `recurring_task_templates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `tasks_household_id_idx` ON `tasks` (`household_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_sort_key_idx` ON `tasks` (`status`,`sort_key`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_user_id_idx` ON `tasks` (`assignee_user_id`);--> statement-breakpoint
CREATE INDEX `tasks_recurring_task_template_id_idx` ON `tasks` (`recurring_task_template_id`);--> statement-breakpoint
CREATE INDEX `tasks_archived_at_idx` ON `tasks` (`archived_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`external_auth_id` text,
	`email` text,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`service_kind` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_external_auth_id_idx` ON `users` (`external_auth_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_household_id_idx` ON `users` (`household_id`);