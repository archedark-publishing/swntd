ALTER TABLE `users` ADD `deactivated_at` integer;--> statement-breakpoint
CREATE INDEX `users_household_deactivated_at_idx` ON `users` (`household_id`,`deactivated_at`);