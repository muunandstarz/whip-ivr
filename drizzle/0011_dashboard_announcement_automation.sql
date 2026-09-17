ALTER TABLE `dashboard_announcements`
  ADD COLUMN `is_automated` boolean NOT NULL DEFAULT false,
  ADD COLUMN `automated_for_date` varchar(10),
  ADD CONSTRAINT `dashboard_announcements_automated_for_date_unique` UNIQUE(`automated_for_date`);

CREATE TABLE `dashboard_announcement_automation` (
  `id` int AUTO_INCREMENT NOT NULL,
  `is_enabled` boolean NOT NULL DEFAULT true,
  `schedule_cron_task_uid` varchar(65),
  `last_run_at` timestamp NULL,
  `last_run_error` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `dashboard_announcement_automation_id` PRIMARY KEY(`id`),
  CONSTRAINT `dashboard_announcement_automation_schedule_cron_task_uid_unique` UNIQUE(`schedule_cron_task_uid`)
);
