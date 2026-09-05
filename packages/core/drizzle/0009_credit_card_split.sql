ALTER TABLE `transactions` ADD `parent_transaction_id` integer REFERENCES transactions(id);
--> statement-breakpoint
CREATE INDEX `idx_transactions_parent` ON `transactions` (`parent_transaction_id`);
