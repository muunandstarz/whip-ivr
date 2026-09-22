CREATE TABLE `internal_tickets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ticket_type` ENUM('bug','issue','suggestion','other') NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `body` TEXT NOT NULL,
  `status` ENUM('new','triaged','in_progress','resolved','closed') NOT NULL DEFAULT 'new',
  `priority` ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  `reporter_user_id` INT NOT NULL,
  `reporter_name` VARCHAR(255) NULL,
  `reporter_email` VARCHAR(320) NULL,
  `reporter_handler_id` INT NULL,
  `triage_note` TEXT NULL,
  `triaged_by_user_id` INT NULL,
  `triaged_by_name` VARCHAR(255) NULL,
  `triaged_at` TIMESTAMP NULL,
  `resolved_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `internal_tickets_reporter_created_idx` (`reporter_user_id`, `created_at`),
  KEY `internal_tickets_status_created_idx` (`status`, `created_at`),
  KEY `internal_tickets_type_created_idx` (`ticket_type`, `created_at`)
);

CREATE TABLE `ticket_digest_automation` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `is_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `schedule_cron_task_uid` VARCHAR(65) NULL,
  `last_digest_for_date` VARCHAR(16) NULL,
  `last_run_at` TIMESTAMP NULL,
  `last_run_error` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ticket_digest_automation_schedule_task_unique` (`schedule_cron_task_uid`)
);

INSERT INTO `ticket_digest_automation` (`is_enabled`)
SELECT TRUE
WHERE NOT EXISTS (SELECT 1 FROM `ticket_digest_automation`);
