CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`parent_id` text,
	`author_name` text NOT NULL,
	`author_channel_id` text,
	`text` text NOT NULL,
	`text_original` text,
	`like_count` integer DEFAULT 0,
	`detected_lang` text,
	`lang_confidence` real,
	`published_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`fetched_at` text DEFAULT (datetime('now')),
	`processed_at` text,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comments_video_idx` ON `comments` (`video_id`);--> statement-breakpoint
CREATE INDEX `comments_status_idx` ON `comments` (`status`);--> statement-breakpoint
CREATE INDEX `comments_published_at_idx` ON `comments` (`published_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `comments_yt_id_unique` ON `comments` (`id`);--> statement-breakpoint
CREATE TABLE `error_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text NOT NULL,
	`source` text NOT NULL,
	`message` text NOT NULL,
	`details` text,
	`stack_trace` text,
	`occurred_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `error_logs_level_idx` ON `error_logs` (`level`);--> statement-breakpoint
CREATE INDEX `error_logs_source_idx` ON `error_logs` (`source`);--> statement-breakpoint
CREATE INDEX `error_logs_time_idx` ON `error_logs` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `knowledge_base` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`tags` text,
	`is_active` integer DEFAULT true,
	`priority` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `kb_type_idx` ON `knowledge_base` (`type`);--> statement-breakpoint
CREATE INDEX `kb_active_idx` ON `knowledge_base` (`is_active`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip_address` text NOT NULL,
	`attempted_at` text DEFAULT (datetime('now')),
	`success` integer DEFAULT false,
	`user_agent` text
);
--> statement-breakpoint
CREATE INDEX `login_attempts_ip_idx` ON `login_attempts` (`ip_address`);--> statement-breakpoint
CREATE INDEX `login_attempts_time_idx` ON `login_attempts` (`attempted_at`);--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`token_type` text DEFAULT 'Bearer',
	`expires_at` text NOT NULL,
	`scope` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_channel_unique` ON `oauth_tokens` (`channel_id`);--> statement-breakpoint
CREATE TABLE `published_replies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comment_id` text NOT NULL,
	`suggestion_id` integer,
	`youtube_reply_id` text NOT NULL,
	`final_text` text NOT NULL,
	`published_at` text DEFAULT (datetime('now')),
	`published_by` text DEFAULT 'owner',
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`suggestion_id`) REFERENCES `suggested_replies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `published_comment_idx` ON `published_replies` (`comment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `published_yt_reply_unique` ON `published_replies` (`youtube_reply_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`expires_at` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`is_valid` integer DEFAULT true
);
--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `suggested_replies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comment_id` text NOT NULL,
	`response_text` text NOT NULL,
	`response_es` text,
	`original_generated` text NOT NULL,
	`edited_text` text,
	`context_used` text,
	`confidence_score` real,
	`needs_confirmation` integer DEFAULT false,
	`confirmation_reason` text,
	`video_links_used` text,
	`detected_comment_lang` text,
	`model_used` text,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`generated_at` text DEFAULT (datetime('now')),
	`reviewed_at` text,
	`status` text DEFAULT 'pending_review' NOT NULL,
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `suggestions_comment_idx` ON `suggested_replies` (`comment_id`);--> statement-breakpoint
CREATE INDEX `suggestions_status_idx` ON `suggested_replies` (`status`);--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_type` text NOT NULL,
	`status` text NOT NULL,
	`videos_processed` integer DEFAULT 0,
	`comments_found` integer DEFAULT 0,
	`new_comments` integer DEFAULT 0,
	`quota_used` integer DEFAULT 0,
	`error_message` text,
	`started_at` text DEFAULT (datetime('now')),
	`completed_at` text
);
--> statement-breakpoint
CREATE TABLE `video_summaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`video_id` text NOT NULL,
	`summary` text NOT NULL,
	`key_topics` text,
	`faqs` text,
	`generated_at` text DEFAULT (datetime('now')),
	`generated_by` text DEFAULT 'gemini',
	`token_count` integer,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_summaries_video_unique` ON `video_summaries` (`video_id`);--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`published_at` text NOT NULL,
	`thumbnail_url` text,
	`duration` text,
	`tags` text,
	`category_id` text,
	`default_language` text,
	`view_count` integer DEFAULT 0,
	`comment_count` integer DEFAULT 0,
	`last_synced_at` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `videos_channel_idx` ON `videos` (`channel_id`);