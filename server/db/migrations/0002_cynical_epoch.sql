CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
ALTER TABLE `oauth_tokens` ADD `channel_title` text;--> statement-breakpoint
ALTER TABLE `oauth_tokens` ADD `channel_thumbnail_url` text;--> statement-breakpoint
ALTER TABLE `oauth_tokens` ADD `channel_subscriber_count` text;--> statement-breakpoint
ALTER TABLE `oauth_tokens` ADD `channel_video_count` text;