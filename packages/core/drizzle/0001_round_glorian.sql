CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`domain` text NOT NULL,
	`asset_class` text,
	`institution` text NOT NULL,
	`label` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "accounts_domain_check" CHECK("accounts"."domain" IN ('investment', 'expense'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_domain_institution_label_unique` ON `accounts` (`domain`,`institution`,`label`);--> statement-breakpoint
CREATE TABLE `asset_contributions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`contribution_date` text NOT NULL,
	`amount` real NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_asset_contributions_asset` ON `asset_contributions` (`asset_id`,`contribution_date`);--> statement-breakpoint
CREATE TABLE `asset_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`effective_from` text NOT NULL,
	`rate` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_asset_rates_asset` ON `asset_rates` (`asset_id`,`effective_from`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_rates_asset_id_effective_from_unique` ON `asset_rates` (`asset_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `asset_valuations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`value` real NOT NULL,
	`valued_at` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_asset_valuations_asset` ON `asset_valuations` (`asset_id`,`valued_at`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`asset_class` text NOT NULL,
	`name` text NOT NULL,
	`valuation_strategy` text NOT NULL,
	`ingestion_mode` text DEFAULT 'manual_entry' NOT NULL,
	`params` text,
	`status` text DEFAULT 'active' NOT NULL,
	`opened_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assets_asset_class_check" CHECK("assets"."asset_class" IN ('ppf', 'epf', 'nps', 'fd', 'gold', 'real_estate', 'cash')),
	CONSTRAINT "assets_valuation_strategy_check" CHECK("assets"."valuation_strategy" IN ('computed', 'manual')),
	CONSTRAINT "assets_ingestion_mode_check" CHECK("assets"."ingestion_mode" IN ('manual_entry', 'file_import')),
	CONSTRAINT "assets_status_check" CHECK("assets"."status" IN ('active', 'closed'))
);
--> statement-breakpoint
CREATE INDEX `idx_assets_account` ON `assets` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_assets_class` ON `assets` (`asset_class`);--> statement-breakpoint
CREATE TABLE `liabilities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer,
	`name` text NOT NULL,
	`loan_type` text NOT NULL,
	`principal` real NOT NULL,
	`annual_rate` real NOT NULL,
	`tenure_months` integer,
	`emi_amount` real,
	`start_date` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "liabilities_loan_type_check" CHECK("liabilities"."loan_type" IN ('home', 'car', 'personal', 'other')),
	CONSTRAINT "liabilities_status_check" CHECK("liabilities"."status" IN ('active', 'closed')),
	CONSTRAINT "liabilities_tenure_or_emi_check" CHECK("liabilities"."tenure_months" IS NOT NULL OR "liabilities"."emi_amount" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `account_id` integer REFERENCES accounts(id);