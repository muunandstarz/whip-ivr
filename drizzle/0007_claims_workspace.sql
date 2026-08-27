CREATE TABLE `claims_workspace_notes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `title` varchar(256) NOT NULL,
  `content` text NOT NULL,
  `tags` json,
  `is_pinned` boolean NOT NULL DEFAULT false,
  `archived_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `claims_workspace_notes_id` PRIMARY KEY(`id`),
  KEY `claims_workspace_notes_user_updated_idx` (`user_id`, `updated_at`)
);

CREATE TABLE `claims_workspace_quick_notes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `content` varchar(1000) NOT NULL,
  `status` enum('active','archived','converted') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `claims_workspace_quick_notes_id` PRIMARY KEY(`id`),
  KEY `claims_workspace_quick_notes_user_status_idx` (`user_id`, `status`)
);

CREATE TABLE `claims_workspace_tasks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `title` varchar(256) NOT NULL,
  `details` text,
  `priority` enum('normal','high','urgent') NOT NULL DEFAULT 'normal',
  `status` enum('active','completed','archived') NOT NULL DEFAULT 'active',
  `due_at` timestamp NULL,
  `remind_at` timestamp NULL,
  `repeat_rule` varchar(32) NOT NULL DEFAULT 'none',
  `source_note_id` int,
  `completed_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `claims_workspace_tasks_id` PRIMARY KEY(`id`),
  KEY `claims_workspace_tasks_user_status_due_idx` (`user_id`, `status`, `due_at`)
);

CREATE TABLE `claims_workspace_scenes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `title` varchar(256) NOT NULL,
  `version_label` varchar(128) NOT NULL DEFAULT 'My Analysis',
  `state` varchar(8),
  `loss_location` varchar(512),
  `road_layout` varchar(32) NOT NULL DEFAULT 'four_way',
  `scene_data` json NOT NULL,
  `analysis_notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `claims_workspace_scenes_id` PRIMARY KEY(`id`),
  KEY `claims_workspace_scenes_user_updated_idx` (`user_id`, `updated_at`)
);
