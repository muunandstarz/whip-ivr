-- Additive, metadata-only DV extraction reviews; no source files or raw text.
-- Drizzle generation was stopped at its unrelated call_history rename prompt.
CREATE TABLE IF NOT EXISTS `insurance_direct_dv_reviews` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `claim_number` varchar(96) NOT NULL,
  `model_id` varchar(96) NOT NULL,
  `status` enum('parsed','failed') NOT NULL,
  `review_output` json NOT NULL,
  `created_by_user_id` int NOT NULL,
  `created_by_name` varchar(255),
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `insurance_direct_dv_reviews_claim_created_idx` (`claim_number`, `created_at`)
);
