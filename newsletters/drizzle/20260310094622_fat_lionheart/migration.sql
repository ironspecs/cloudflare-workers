CREATE TABLE `hostname_config` (
	`hostname` text PRIMARY KEY,
	`google_recaptcha_secret` text
);
--> statement-breakpoint
CREATE TABLE `list_config` (
	`id` text PRIMARY KEY,
	`hostname` text NOT NULL,
	`list_name` text NOT NULL,
	`email_confirm` text
);
--> statement-breakpoint
CREATE TABLE `subscription` (
	`id` text PRIMARY KEY,
	`email` text NOT NULL,
	`hostname` text NOT NULL,
	`list_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`person_name` text,
	`email_confirmed_at` integer,
	`unsubscribed_at` integer
);
--> statement-breakpoint
CREATE TABLE `subscription_token` (
	`id` text PRIMARY KEY,
	`subscription_id` text NOT NULL,
	`token_type` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `list_config_hostname_list_name` ON `list_config` (`hostname`,`list_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_email_hostname_list_name` ON `subscription` (`email`,`hostname`,`list_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_token_subscription_id_token_type` ON `subscription_token` (`subscription_id`,`token_type`);