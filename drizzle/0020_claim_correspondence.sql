-- Claim-number-scoped correspondence created in Document Generator.
-- This table intentionally supports only created_not_sent rows and has no
-- provider message, sender, or queue fields; creating a record never sends mail.
CREATE TABLE IF NOT EXISTS `claim_correspondence` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `claimNumber` VARCHAR(64) NOT NULL,
  `recipientName` VARCHAR(256) NULL,
  `recipientEmail` VARCHAR(320) NOT NULL,
  `subject` VARCHAR(512) NOT NULL,
  `bodyText` TEXT NOT NULL,
  `status` ENUM('created_not_sent') NOT NULL DEFAULT 'created_not_sent',
  `createdByUserId` INT NOT NULL,
  `createdByName` VARCHAR(256) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  INDEX `claim_correspondence_claim_created_idx` (`claimNumber`, `createdAt`)
);
