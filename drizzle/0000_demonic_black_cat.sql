CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`owner` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `views` (
	`story` text NOT NULL,
	`visitor` text NOT NULL,
	`day` text NOT NULL,
	PRIMARY KEY(`story`, `visitor`, `day`)
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`story` text NOT NULL,
	`user` text NOT NULL,
	`rating` integer NOT NULL,
	PRIMARY KEY(`story`, `user`)
);
