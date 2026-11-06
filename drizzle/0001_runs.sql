CREATE TABLE `run_events` (
	`run_id` text NOT NULL,
	`seq` integer NOT NULL,
	`step` text,
	`type` text NOT NULL,
	`payload_json` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`run_id`, `seq`),
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `run_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`answer_json` text,
	`answered_by` text,
	`asked_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`answered_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`answered_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `run_questions_run_id_idx` ON `run_questions` (`run_id`);--> statement-breakpoint
CREATE TABLE `run_results` (
	`run_id` text PRIMARY KEY NOT NULL,
	`result_json` text,
	`gap_list_json` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "run_results_exactly_one" CHECK(("run_results"."result_json" is null) <> ("run_results"."gap_list_json" is null))
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
	CONSTRAINT "runs_status_valid" CHECK("runs"."status" in ('preflight', 'running', 'blocked_on_question', 'released', 'gap_list', 'failed', 'cancelled')),
	CONSTRAINT "runs_mode_valid" CHECK("runs"."mode" in ('real', 'stub'))
);
--> statement-breakpoint
CREATE INDEX `runs_project_started_idx` ON `runs` (`project_id`,`started_at`);