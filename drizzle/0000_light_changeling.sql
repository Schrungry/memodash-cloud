CREATE TABLE `cards` (
	`user_id` text NOT NULL,
	`word_id` text NOT NULL,
	`book_id` text NOT NULL,
	`word` text NOT NULL,
	`data` text NOT NULL,
	`due` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`user_id`, `word_id`)
);
--> statement-breakpoint
CREATE INDEX `cards_user_due` ON `cards` (`user_id`,`due`);--> statement-breakpoint
CREATE TABLE `custom_words` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`settings` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`word_id` text NOT NULL,
	`book_id` text NOT NULL,
	`word` text NOT NULL,
	`rating` integer NOT NULL,
	`reviewed_at` text NOT NULL,
	`day` text NOT NULL,
	`is_new` integer NOT NULL,
	`duration` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reviews_user_day` ON `reviews` (`user_id`,`day`);