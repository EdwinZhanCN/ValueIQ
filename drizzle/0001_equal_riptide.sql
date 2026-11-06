CREATE TABLE `run_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_reports_r2_key_unique` ON `run_reports` (`r2_key`);--> statement-breakpoint
CREATE INDEX `run_reports_run_idx` ON `run_reports` (`run_id`);--> statement-breakpoint
CREATE TABLE `run_results` (
	`run_id` text PRIMARY KEY NOT NULL,
	`result_json` text,
	`gap_list_json` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "run_results_exactly_one" CHECK(("run_results"."result_json" is null) != ("run_results"."gap_list_json" is null))
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`status` text NOT NULL,
	`mode` text NOT NULL,
	`form_hash` text NOT NULL,
	`contract_version` text NOT NULL,
	`formula_version` text NOT NULL,
	`settings_version` text NOT NULL,
	`started_by` text NOT NULL,
	`started_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`started_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "runs_status_valid" CHECK("runs"."status" in ('idle','preflight','running','blocked_on_question','released','gap_list','failed','cancelled')),
	CONSTRAINT "runs_mode_valid" CHECK("runs"."mode" in ('real','stub'))
);
--> statement-breakpoint
CREATE INDEX `runs_project_started_idx` ON `runs` (`project_id`,`started_at`);