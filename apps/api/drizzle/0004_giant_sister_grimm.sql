CREATE TABLE `commitment_checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`commitment_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`checkin_on` text NOT NULL,
	`amount` integer DEFAULT 1 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`commitment_id`) REFERENCES `commitments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `commitment_checkins_commitment_id_idx` ON `commitment_checkins` (`commitment_id`);--> statement-breakpoint
CREATE INDEX `commitment_checkins_commitment_date_idx` ON `commitment_checkins` (`commitment_id`,`checkin_on`);--> statement-breakpoint
CREATE TABLE `commitment_checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`commitment_id` text NOT NULL,
	`body` text NOT NULL,
	`is_completed` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`commitment_id`) REFERENCES `commitments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `commitment_checklist_items_commitment_id_idx` ON `commitment_checklist_items` (`commitment_id`);--> statement-breakpoint
CREATE TABLE `commitment_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`opened_by_retrospective_id` text,
	`reviewed_by_retrospective_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`period_start_on` text NOT NULL,
	`closure_on` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `commitment_periods_household_status_idx` ON `commitment_periods` (`household_id`,`status`);--> statement-breakpoint
CREATE INDEX `commitment_periods_household_closure_idx` ON `commitment_periods` (`household_id`,`closure_on`);--> statement-breakpoint
CREATE TABLE `commitment_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`commitment_id` text NOT NULL,
	`retrospective_id` text NOT NULL,
	`round_id` text NOT NULL,
	`rating` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`commitment_id`) REFERENCES `commitments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`retrospective_id`) REFERENCES `retrospectives`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`round_id`) REFERENCES `retrospective_rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `commitment_reviews_commitment_id_idx` ON `commitment_reviews` (`commitment_id`);--> statement-breakpoint
CREATE INDEX `commitment_reviews_retrospective_id_idx` ON `commitment_reviews` (`retrospective_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `commitment_reviews_commitment_retrospective_idx` ON `commitment_reviews` (`commitment_id`,`retrospective_id`);--> statement-breakpoint
CREATE TABLE `commitments` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`commitment_period_id` text,
	`created_in_retrospective_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`assignee_user_id` text,
	`tracking_kind` text NOT NULL,
	`tracking_interval` text DEFAULT 'none' NOT NULL,
	`target_count` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`commitment_period_id`) REFERENCES `commitment_periods`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_in_retrospective_id`) REFERENCES `retrospectives`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `commitments_household_status_idx` ON `commitments` (`household_id`,`status`);--> statement-breakpoint
CREATE INDEX `commitments_period_idx` ON `commitments` (`commitment_period_id`);--> statement-breakpoint
CREATE INDEX `commitments_created_in_retrospective_idx` ON `commitments` (`created_in_retrospective_id`);--> statement-breakpoint
CREATE TABLE `retrospective_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`commitment_period_id` text NOT NULL,
	`template_round_id` text,
	`retrospective_id` text,
	`round_id` text,
	`author_user_id` text NOT NULL,
	`body` text NOT NULL,
	`entry_phase` text NOT NULL,
	`visibility_state` text NOT NULL,
	`revealed_in_retrospective_id` text,
	`revealed_in_round_id` text,
	`revealed_at` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`commitment_period_id`) REFERENCES `commitment_periods`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_round_id`) REFERENCES `retrospective_template_rounds`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`retrospective_id`) REFERENCES `retrospectives`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`round_id`) REFERENCES `retrospective_rounds`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`revealed_in_retrospective_id`) REFERENCES `retrospectives`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`revealed_in_round_id`) REFERENCES `retrospective_rounds`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `retrospective_notes_household_author_idx` ON `retrospective_notes` (`household_id`,`author_user_id`);--> statement-breakpoint
CREATE INDEX `retrospective_notes_period_idx` ON `retrospective_notes` (`commitment_period_id`);--> statement-breakpoint
CREATE INDEX `retrospective_notes_round_idx` ON `retrospective_notes` (`round_id`);--> statement-breakpoint
CREATE INDEX `retrospective_notes_revealed_retrospective_idx` ON `retrospective_notes` (`revealed_in_retrospective_id`);--> statement-breakpoint
CREATE TABLE `retrospective_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`retrospective_id` text NOT NULL,
	`source_template_round_id` text,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`entry_phase` text,
	`privacy` text,
	`config_json` text DEFAULT '{}' NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`summary` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`retrospective_id`) REFERENCES `retrospectives`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_template_round_id`) REFERENCES `retrospective_template_rounds`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `retrospective_rounds_retrospective_id_idx` ON `retrospective_rounds` (`retrospective_id`);--> statement-breakpoint
CREATE TABLE `retrospective_template_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`entry_phase` text,
	`privacy` text,
	`config_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `retrospective_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `retrospective_template_rounds_template_id_idx` ON `retrospective_template_rounds` (`template_id`);--> statement-breakpoint
CREATE TABLE `retrospective_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `retrospective_templates_household_id_idx` ON `retrospective_templates` (`household_id`);--> statement-breakpoint
CREATE TABLE `retrospectives` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`template_id` text NOT NULL,
	`commitment_period_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_round_id` text,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	`started_at` integer,
	`finalized_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `retrospective_templates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`commitment_period_id`) REFERENCES `commitment_periods`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `retrospectives_household_status_idx` ON `retrospectives` (`household_id`,`status`);--> statement-breakpoint
CREATE INDEX `retrospectives_commitment_period_idx` ON `retrospectives` (`commitment_period_id`);--> statement-breakpoint
ALTER TABLE `household_settings` ADD `retrospective_cadence` text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE `household_settings` ADD `retrospective_cadence_interval` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `household_settings` ADD `default_retrospective_template_id` text REFERENCES retrospective_templates(id);--> statement-breakpoint
ALTER TABLE `household_settings` ADD `finalized_retrospective_edit_policy` text DEFAULT 'locked' NOT NULL;
