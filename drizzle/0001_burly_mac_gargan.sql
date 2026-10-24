CREATE TABLE `history_words` (
	`user_id` text NOT NULL,
	`word_id` text NOT NULL,
	`book_id` text NOT NULL,
	`word` text NOT NULL,
	`definition` text NOT NULL,
	PRIMARY KEY(`user_id`, `word_id`)
);
--> statement-breakpoint
ALTER TABLE `reviews` ADD `card_data` text;--> statement-breakpoint
CREATE INDEX `reviews_user_time` ON `reviews` (`user_id`,`reviewed_at`);--> statement-breakpoint
CREATE INDEX `reviews_user_word_time` ON `reviews` (`user_id`,`word_id`,`reviewed_at`);