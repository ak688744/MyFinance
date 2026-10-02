CREATE TABLE `fund_universe` (
	`amfi_code` text PRIMARY KEY NOT NULL,
	`scheme_name` text NOT NULL,
	`amc` text NOT NULL,
	`category` text NOT NULL,
	`latest_nav` real,
	`latest_nav_date` text,
	`history_start` text,
	`rankable` integer DEFAULT 0 NOT NULL,
	`built_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_fund_universe_category` ON `fund_universe` (`category`);
--> statement-breakpoint
CREATE TABLE `fund_monthly_nav` (
	`amfi_code` text NOT NULL,
	`month_end` text NOT NULL,
	`nav` real NOT NULL,
	PRIMARY KEY(`amfi_code`, `month_end`)
);
--> statement-breakpoint
CREATE TABLE `fund_performance` (
	`amfi_code` text PRIMARY KEY NOT NULL,
	`as_of` text NOT NULL,
	`benchmark_code` text,
	`r1y` real,
	`r3y` real,
	`r5y` real,
	`r10y` real,
	`vol_3y` real,
	`max_drawdown_5y` real,
	`rolling3y_beat_pct` real,
	`rolling3y_median_excess` real,
	`up_capture_3y` real,
	`down_capture_3y` real,
	`category_pctile_3y` real,
	`category_pctile_5y` real
);
--> statement-breakpoint
CREATE TABLE `category_stats` (
	`category` text NOT NULL,
	`metric` text NOT NULL,
	`p25` real NOT NULL,
	`median` real NOT NULL,
	`p75` real NOT NULL,
	`n` integer NOT NULL,
	`as_of` text NOT NULL,
	PRIMARY KEY(`category`, `metric`)
);
--> statement-breakpoint
CREATE TABLE `investment_review_cache` (
	`signature` text PRIMARY KEY NOT NULL,
	`review_json` text NOT NULL,
	`model` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `candidate_details` (
	`amfi_code` text PRIMARY KEY NOT NULL,
	`details_json` text NOT NULL,
	`fetched_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
