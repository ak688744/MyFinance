CREATE TABLE `expense_insight_triage` (
	`signature` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`verdict_json` text NOT NULL,
	`triaged_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `expense_insight_triage_month_idx` ON `expense_insight_triage` (`month`);
