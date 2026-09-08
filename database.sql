-- Structure de la base de données ZUBIKS SERVICE
CREATE DATABASE IF NOT EXISTS `zubiks_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `zubiks_db`;

-- Table Global Stats & Paramètres
CREATE TABLE IF NOT EXISTS `global_stats` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `dailyDepots` DECIMAL(15,2) DEFAULT 0,
    `dailyRetraits` DECIMAL(15,2) DEFAULT 0,
    `cycleDepots` DECIMAL(15,2) DEFAULT 0,
    `cycleRetraits` DECIMAL(15,2) DEFAULT 0,
    `argentDebut` DECIMAL(15,2) DEFAULT 0,
    `reglements` TEXT,
    `admin_email` VARCHAR(255) DEFAULT 'zubiksservice@gmail.com',
    `admin_password` VARCHAR(255) DEFAULT NULL,
    `profilePhoto` LONGTEXT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insertion de la ligne par défaut dans global_stats
INSERT INTO `global_stats` (`id`, `dailyDepots`, `dailyRetraits`, `cycleDepots`, `cycleRetraits`, `argentDebut`, `reglements`, `admin_email`)
SELECT 1, 0, 0, 0, 0, 0, '', 'zubiksservice@gmail.com'
WHERE NOT EXISTS (SELECT 1 FROM `global_stats` WHERE `id` = 1);

-- Table Membres & Utilisateurs
CREATE TABLE IF NOT EXISTS `members` (
    `id` VARCHAR(64) PRIMARY KEY,
    `nom` VARCHAR(255) NOT NULL,
    `postnom` VARCHAR(255) DEFAULT '',
    `sexe` VARCHAR(10) DEFAULT 'M',
    `email` VARCHAR(255) UNIQUE DEFAULT NULL,
    `password` VARCHAR(255) DEFAULT NULL,
    `role` VARCHAR(50) DEFAULT 'user',
    `status` VARCHAR(50) DEFAULT 'active',
    `parts` INT DEFAULT 1,
    `totalDepot` DECIMAL(15,2) DEFAULT 0,
    `totalRetrait` DECIMAL(15,2) DEFAULT 0,
    `dateAjout` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `profilePhoto` LONGTEXT,
    `notifications` LONGTEXT
);

-- Table Transactions (Dépôts & Retraits Cash)
CREATE TABLE IF NOT EXISTS `transactions` (
    `id` VARCHAR(64) PRIMARY KEY,
    `memberId` VARCHAR(64) NOT NULL,
    `memberNom` VARCHAR(255) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `date` DATE NOT NULL,
    `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `adminNom` VARCHAR(255) DEFAULT 'Admin'
);

-- Table Archives des Cycles
CREATE TABLE IF NOT EXISTS `archives` (
    `id` VARCHAR(64) PRIMARY KEY,
    `date` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `cycleDepots` DECIMAL(15,2) DEFAULT 0,
    `cycleRetraits` DECIMAL(15,2) DEFAULT 0,
    `solde` DECIMAL(15,2) DEFAULT 0,
    `userId` VARCHAR(64) DEFAULT NULL
);

-- Table Archives Journalières
CREATE TABLE IF NOT EXISTS `daily_archives` (
    `id` VARCHAR(64) PRIMARY KEY,
    `date` DATE NOT NULL,
    `dailyDepots` DECIMAL(15,2) DEFAULT 0,
    `dailyRetraits` DECIMAL(15,2) DEFAULT 0,
    `solde` DECIMAL(15,2) DEFAULT 0
);

-- Table Messagerie Support (Client - Admin)
CREATE TABLE IF NOT EXISTS `messages` (
    `id` VARCHAR(64) PRIMARY KEY,
    `memberId` VARCHAR(64) NOT NULL,
    `sender` VARCHAR(50) NOT NULL,
    `senderName` VARCHAR(255) NOT NULL,
    `text` TEXT NOT NULL,
    `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `readByAdmin` TINYINT(1) DEFAULT 0,
    `readByUser` TINYINT(1) DEFAULT 0
);
