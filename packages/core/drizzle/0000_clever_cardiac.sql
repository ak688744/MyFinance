CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `category_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_type` text NOT NULL,
	`pattern_value` text NOT NULL,
	`category_id` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_from_transaction_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_from_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "category_rules_rule_type_check" CHECK("category_rules"."rule_type" IN ('merchant', 'upi_note_keyword'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_rules_rule_type_pattern_value_unique` ON `category_rules` (`rule_type`,`pattern_value`);--> statement-breakpoint
CREATE TABLE `import_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_name` text NOT NULL,
	`source_type` text NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`transaction_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `investment_holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_history_id` integer NOT NULL,
	`scheme_id` integer,
	`account_name` text NOT NULL,
	`investment_app` text NOT NULL,
	`scheme_name` text NOT NULL,
	`folio_number` text,
	`units` real NOT NULL,
	`invested_value` real NOT NULL,
	`current_value` real NOT NULL,
	`returns_amount` real NOT NULL,
	`returns_xirr` real,
	`as_of_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`import_history_id`) REFERENCES `investment_import_history`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scheme_id`) REFERENCES `investment_schemes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_investment_holdings_scheme` ON `investment_holdings` (`scheme_id`);--> statement-breakpoint
CREATE INDEX `idx_investment_holdings_date` ON `investment_holdings` ("as_of_date" DESC);--> statement-breakpoint
CREATE INDEX `idx_investment_holdings_account` ON `investment_holdings` (`account_name`,`investment_app`);--> statement-breakpoint
CREATE TABLE `investment_import_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_name` text NOT NULL,
	`investment_app` text NOT NULL,
	`import_type` text NOT NULL,
	`file_name` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`record_count` integer,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`total_invested` real,
	`total_current_value` real,
	`total_xirr` real,
	`holder_name` text,
	`holder_pan` text,
	CONSTRAINT "investment_import_history_import_type_check" CHECK("investment_import_history"."import_type" IN ('holdings', 'transactions'))
);
--> statement-breakpoint
CREATE TABLE `investment_schemes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scheme_name` text NOT NULL,
	`amfi_code` text,
	`isin` text,
	`amc_name` text,
	`category` text,
	`sub_category` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "investment_schemes_category_check" CHECK("investment_schemes"."category" IN ('equity', 'debt', 'hybrid', 'other'))
);
--> statement-breakpoint
CREATE INDEX `idx_investment_schemes_category` ON `investment_schemes` (`category`,`sub_category`);--> statement-breakpoint
CREATE INDEX `idx_investment_schemes_amc` ON `investment_schemes` (`amc_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `investment_schemes_scheme_name_amc_name_unique` ON `investment_schemes` (`scheme_name`,`amc_name`);--> statement-breakpoint
CREATE TABLE `investment_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scheme_id` integer,
	`account_name` text NOT NULL,
	`investment_app` text NOT NULL,
	`scheme_name` text NOT NULL,
	`transaction_type` text NOT NULL,
	`units` real NOT NULL,
	`nav` real NOT NULL,
	`amount` real NOT NULL,
	`transaction_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`scheme_id`) REFERENCES `investment_schemes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "investment_transactions_transaction_type_check" CHECK("investment_transactions"."transaction_type" IN ('PURCHASE', 'REDEMPTION', 'SWITCH_IN', 'SWITCH_OUT', 'DIVIDEND'))
);
--> statement-breakpoint
CREATE INDEX `idx_investment_transactions_scheme` ON `investment_transactions` (`scheme_id`);--> statement-breakpoint
CREATE INDEX `idx_investment_transactions_account` ON `investment_transactions` (`account_name`,`investment_app`);--> statement-breakpoint
CREATE INDEX `idx_investment_transactions_date` ON `investment_transactions` ("transaction_date" DESC);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_date` text NOT NULL,
	`value_date` text,
	`reference_number` text,
	`description` text NOT NULL,
	`normalized_description` text NOT NULL,
	`merchant_key` text,
	`upi_note_keyword` text,
	`amount` real NOT NULL,
	`direction` text NOT NULL,
	`category_id` text,
	`category_source` text,
	`balance` real,
	`source_type` text NOT NULL,
	`import_history_id` integer,
	`dedupe_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_history_id`) REFERENCES `import_history`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_direction_check" CHECK("transactions"."direction" IN ('debit', 'credit'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_dedupe_key_unique` ON `transactions` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_transactions_date` ON `transactions` ("transaction_date" DESC);--> statement-breakpoint
CREATE INDEX `idx_transactions_category` ON `transactions` (`category_id`);