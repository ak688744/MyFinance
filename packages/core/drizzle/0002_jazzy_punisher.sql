PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_category_rules` (
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
	CONSTRAINT "category_rules_rule_type_check" CHECK("__new_category_rules"."rule_type" IN ('merchant', 'upi_note_keyword', 'keyword'))
);
--> statement-breakpoint
INSERT INTO `__new_category_rules`("id", "rule_type", "pattern_value", "category_id", "priority", "is_active", "created_from_transaction_id", "created_at") SELECT "id", "rule_type", "pattern_value", "category_id", "priority", "is_active", "created_from_transaction_id", "created_at" FROM `category_rules`;--> statement-breakpoint
DROP TABLE `category_rules`;--> statement-breakpoint
ALTER TABLE `__new_category_rules` RENAME TO `category_rules`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `category_rules_rule_type_pattern_value_unique` ON `category_rules` (`rule_type`,`pattern_value`);