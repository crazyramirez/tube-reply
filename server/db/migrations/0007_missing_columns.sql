ALTER TABLE `comments` ADD COLUMN `author_profile_image_url` text;--> statement-breakpoint
ALTER TABLE `comments` ADD COLUMN `last_activity_at` text;--> statement-breakpoint
ALTER TABLE `comments` ADD COLUMN `last_activity_text` text;--> statement-breakpoint
ALTER TABLE `comments` ADD COLUMN `last_activity_author` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `comments_parent_idx` ON `comments` (`parent_id`, `published_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `comments_list_perf_idx` ON `comments` (`status`, `last_activity_at`);
