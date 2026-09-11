<?php
$host = 'bwtcfitfo4ql4khfhujg-mysql.services.clever-cloud.com';
$db   = 'bwtcfitfo4ql4khfhujg';
$user = 'uwnegnvywjrnng9j';
$pass = 'PJbfLRxZtAvunanCxdjg';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
     $pdo = new PDO($dsn, $user, $pass, $options);
     echo "Connected successfully to Clever Cloud MySQL.\n";
     
     $sql = file_get_contents('database.sql');
     
     // Remove CREATE DATABASE and USE statements as Clever Cloud provides a specific DB
     $sql = preg_replace('/CREATE DATABASE IF NOT EXISTS.*?;/s', '', $sql);
     $sql = preg_replace('/USE `.*?;/s', '', $sql);
     
     $pdo->exec($sql);
     echo "Database schema imported successfully!\n";
} catch (\PDOException $e) {
     throw new \PDOException($e->getMessage(), (int)$e->getCode());
}
?>
