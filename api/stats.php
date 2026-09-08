<?php
// api/stats.php - Statistiques globales, règlements et archivage

require_once __DIR__ . '/db.php';

session_start();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$input = getJsonInput();

// GET: Récupérer les stats globales et archives
if ($method === 'GET') {
    $stmtStats = $pdo->query("SELECT * FROM global_stats WHERE id = 1");
    $stats = $stmtStats->fetch() ?: [
        'dailyDepots' => 0,
        'dailyRetraits' => 0,
        'cycleDepots' => 0,
        'cycleRetraits' => 0,
        'argentDebut' => 0,
        'reglements' => '',
        'admin_email' => 'zubiksservice@gmail.com'
    ];

    $stmtArchives = $pdo->query("SELECT * FROM archives ORDER BY date DESC");
    $archives = $stmtArchives->fetchAll();

    $stmtDailyArchives = $pdo->query("SELECT * FROM daily_archives ORDER BY date DESC");
    $dailyArchives = $stmtDailyArchives->fetchAll();

    sendJson([
        'stats' => $stats,
        'archives' => $archives,
        'dailyArchives' => $dailyArchives
    ]);
}

// POST: Actions d'archivage ou de mise à jour des paramètres
if ($method === 'POST') {
    if ($action === 'update_reglements') {
        $reglements = $input['reglements'] ?? '';
        $stmt = $pdo->prepare("UPDATE global_stats SET reglements = ? WHERE id = 1");
        $stmt->execute([$reglements]);
        sendJson(['message' => 'Règlements mis à jour.']);
    }

    if ($action === 'archive_day') {
        $stmtStats = $pdo->query("SELECT dailyDepots, dailyRetraits FROM global_stats WHERE id = 1");
        $s = $stmtStats->fetch();

        $dailyDepots = (float)($s['dailyDepots'] ?? 0);
        $dailyRetraits = (float)($s['dailyRetraits'] ?? 0);
        $solde = $dailyDepots - $dailyRetraits;
        $dateToday = date('Y-m-d');
        $id = 'day_' . time();

        $pdo->beginTransaction();
        try {
            $stmtA = $pdo->prepare("INSERT INTO daily_archives (id, date, dailyDepots, dailyRetraits, solde) VALUES (?, ?, ?, ?, ?)");
            $stmtA->execute([$id, $dateToday, $dailyDepots, $dailyRetraits, $solde]);

            $stmtR = $pdo->query("UPDATE global_stats SET dailyDepots = 0, dailyRetraits = 0 WHERE id = 1");
            $pdo->commit();

            sendJson(['message' => 'Journée archivée avec succès.']);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendJson(['error' => 'Erreur lors de l\'archivage journalier : ' . $e->getMessage()], 500);
        }
    }

    if ($action === 'archive_cycle') {
        $stmtStats = $pdo->query("SELECT cycleDepots, cycleRetraits FROM global_stats WHERE id = 1");
        $s = $stmtStats->fetch();

        $cycleDepots = (float)($s['cycleDepots'] ?? 0);
        $cycleRetraits = (float)($s['cycleRetraits'] ?? 0);
        $solde = $cycleDepots - $cycleRetraits;
        $now = date('Y-m-d H:i:s');
        $id = 'cycle_' . time();

        $pdo->beginTransaction();
        try {
            $stmtA = $pdo->prepare("INSERT INTO archives (id, date, cycleDepots, cycleRetraits, solde) VALUES (?, ?, ?, ?, ?)");
            $stmtA->execute([$id, $now, $cycleDepots, $cycleRetraits, $solde]);

            $stmtR = $pdo->query("UPDATE global_stats SET cycleDepots = 0, cycleRetraits = 0, dailyDepots = 0, dailyRetraits = 0 WHERE id = 1");
            $pdo->commit();

            sendJson(['message' => 'Cycle archivé avec succès.']);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendJson(['error' => 'Erreur lors de l\'archivage du cycle : ' . $e->getMessage()], 500);
        }
    }

    if ($action === 'reset_app') {
        $pdo->query("DELETE FROM transactions");
        $pdo->query("DELETE FROM members");
        $pdo->query("DELETE FROM archives");
        $pdo->query("DELETE FROM daily_archives");
        $pdo->query("DELETE FROM messages");
        $pdo->query("UPDATE global_stats SET dailyDepots = 0, dailyRetraits = 0, cycleDepots = 0, cycleRetraits = 0, argentDebut = 0 WHERE id = 1");

        sendJson(['message' => 'Toutes les données ont été réinitialisées avec succès.']);
    }
}

sendJson(['error' => 'Action ou méthode non autorisée.'], 405);
