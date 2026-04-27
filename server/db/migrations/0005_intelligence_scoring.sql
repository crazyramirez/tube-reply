-- Intelligence scoring fields on comments
ALTER TABLE `comments` ADD COLUMN `priority_score` integer DEFAULT 50;
ALTER TABLE `comments` ADD COLUMN `priority_label` text DEFAULT 'normal';
ALTER TABLE `comments` ADD COLUMN `is_return_commenter` integer DEFAULT 0;
ALTER TABLE `comments` ADD COLUMN `opportunity_flags` text;
ALTER TABLE `comments` ADD COLUMN `detected_intent` text;

-- Reply performance tracking
ALTER TABLE `published_replies` ADD COLUMN `like_count` integer DEFAULT 0;
ALTER TABLE `published_replies` ADD COLUMN `commenter_replied_back` integer DEFAULT 0;
ALTER TABLE `published_replies` ADD COLUMN `thread_growth_after` integer DEFAULT 0;
ALTER TABLE `published_replies` ADD COLUMN `reply_metrics_synced_at` text;

-- Priority index for inbox
CREATE INDEX IF NOT EXISTS `comments_priority_idx` ON `comments` (`status`, `priority_score`);

-- Automation rules
CREATE TABLE IF NOT EXISTS `automation_rules` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `is_active` integer DEFAULT 1,
  `conditions` text NOT NULL,
  `action` text NOT NULL,
  `action_params` text,
  `trigger_count` integer DEFAULT 0,
  `created_at` text DEFAULT (datetime('now')),
  `updated_at` text DEFAULT (datetime('now'))
);

-- Video ideas cache
CREATE TABLE IF NOT EXISTS `video_ideas_cache` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `clusters` text NOT NULL,
  `generated_at` text DEFAULT (datetime('now')),
  `comments_analyzed` integer DEFAULT 0,
  `model_used` text
);
