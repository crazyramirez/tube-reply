CREATE TABLE `authors` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`profile_image_url` text,
	`last_seen_at` text,
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `authors_name_idx` ON `authors` (`name`);--> statement-breakpoint
ALTER TABLE `comments` ADD `translated_text` text;--> statement-breakpoint
ALTER TABLE `comments` ADD `translation_lang` text;--> statement-breakpoint
CREATE INDEX `comments_author_channel_idx` ON `comments` (`author_channel_id`);