CREATE TABLE IF NOT EXISTS `banned_authors` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`author_name` text NOT NULL,
	`banned_at` text DEFAULT (datetime('now')),
	`reason` text
);
