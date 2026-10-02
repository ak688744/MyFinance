CREATE TABLE `scheme_fundamentals` (
	`scheme_id` integer PRIMARY KEY NOT NULL REFERENCES investment_schemes(id),
	`expense_ratio_direct` real,
	`expense_ratio_regular` real,
	`plan_type` text CHECK (`plan_type` IN ('direct', 'regular', 'unknown')),
	`aum` real,
	`benchmark_name` text,
	`std_dev` real,
	`sharpe` real,
	`beta` real,
	`alpha` real,
	`source` text NOT NULL,
	`fetched_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scheme_holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scheme_id` integer NOT NULL REFERENCES investment_schemes(id),
	`as_of_date` text NOT NULL,
	`security_name` text NOT NULL,
	`isin` text,
	`weight_pct` real NOT NULL,
	`sector` text,
	`market_cap_bucket` text CHECK (`market_cap_bucket` IN ('large', 'mid', 'small', 'other'))
);
--> statement-breakpoint
CREATE INDEX `idx_scheme_holdings_scheme_date` ON `scheme_holdings` (`scheme_id`, `as_of_date`);
