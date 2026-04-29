CREATE TABLE IF NOT EXISTS `video_transcripts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `video_id` text NOT NULL REFERENCES `videos`(`id`),
  `language` text NOT NULL,
  `track_name` text,
  `caption_id` text,
  `transcript` text NOT NULL,
  `word_count` integer,
  `is_auto_generated` integer DEFAULT false,
  `fetched_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `video_transcripts_video_lang_unique` ON `video_transcripts` (`video_id`, `language`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `video_analytics` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `video_id` text NOT NULL REFERENCES `videos`(`id`),
  `snapshot_date` text NOT NULL,
  `views` integer DEFAULT 0,
  `estimated_minutes_watched` integer DEFAULT 0,
  `average_view_duration` real DEFAULT 0,
  `average_view_percentage` real DEFAULT 0,
  `impressions` integer DEFAULT 0,
  `impression_ctr` real DEFAULT 0,
  `subscribers_gained` integer DEFAULT 0,
  `subscribers_lost` integer DEFAULT 0,
  `likes` integer DEFAULT 0,
  `shares` integer DEFAULT 0,
  `fetched_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `video_analytics_video_date_unique` ON `video_analytics` (`video_id`, `snapshot_date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_analytics_video_idx` ON `video_analytics` (`video_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `video_analytics_date_idx` ON `video_analytics` (`snapshot_date`);
