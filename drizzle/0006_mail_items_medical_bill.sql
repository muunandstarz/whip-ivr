ALTER TABLE `mail_items`
  ADD COLUMN `is_medical_bill` TINYINT NOT NULL DEFAULT 0 AFTER `is_demand`;

CREATE INDEX `mail_items_medical_bill_idx` ON `mail_items` (`is_medical_bill`);
