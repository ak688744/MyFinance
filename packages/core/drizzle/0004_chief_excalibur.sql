CREATE TABLE `ai_models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_string` text NOT NULL,
	`label` text NOT NULL,
	`input_per_m` real NOT NULL,
	`output_per_m` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `ai_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ai_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`dialect` text NOT NULL,
	`label` text NOT NULL,
	`secret_enc` text,
	`config_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "ai_providers_dialect_check" CHECK("ai_providers"."dialect" IN ('gemini','openai-compatible','bedrock'))
);
--> statement-breakpoint
CREATE TABLE `ai_task_routes` (
	`task` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `ai_models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ai_usage_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` text NOT NULL,
	`task` text NOT NULL,
	`provider_id` text NOT NULL,
	`dialect` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`call_count` integer NOT NULL,
	`cost_usd` real,
	`ok` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_usage_ts_idx` ON `ai_usage_events` (`ts`);--> statement-breakpoint
CREATE INDEX `ai_usage_task_idx` ON `ai_usage_events` (`task`);