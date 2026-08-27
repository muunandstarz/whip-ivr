CREATE TABLE IF NOT EXISTS `dashboard_announcements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(180) NOT NULL,
  `message` text NOT NULL,
  `kind` enum('feature','message') NOT NULL DEFAULT 'message',
  `action_label` varchar(80),
  `action_href` varchar(512),
  `is_active` boolean NOT NULL DEFAULT true,
  `starts_at` datetime,
  `ends_at` datetime,
  `created_by_user_id` int,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `dashboard_announcements_active_window_idx` (`is_active`, `starts_at`, `ends_at`)
);

CREATE TABLE IF NOT EXISTS `user_birthday_preferences` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `birth_month` int,
  `birth_day` int,
  `is_opted_in` boolean NOT NULL DEFAULT false,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_birthday_preferences_user_id_unique` (`user_id`),
  KEY `user_birthday_preferences_lookup_idx` (`is_opted_in`, `birth_month`, `birth_day`)
);
