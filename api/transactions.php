<?php
// api/transactions.php - Gestion des dépôts et retraits cash

require_once __DIR__ . '/db.php';

session_start();
$method = $_SERVER['REQUEST_METHOD'];
$input = getJsonInput();

// GET: Lister les transactions
if ($method === 'GET') {
    $memberId = $_GET['memberId'] ?? null;
    if ($memberId) {
        $stmt = $pdo->prepare("SELECT * FROM transactions WHERE memberId = ? ORDER BY timestamp ASC");
        $stmt->execute([$memberId]);
    } else {
        $stmt = $pdo->query("SELECT * FROM transactions ORDER BY timestamp ASC");
    }
    $txs = $stmt->fetchAll();
    sendJson($txs);
}

// POST: Ajouter une transaction cash (Dépôt ou Retrait)
if ($method === 'POST') {
    $memberId = $input['memberId'] ?? '';
    $memberNom = $input['memberNom'] ?? '';
    $type = $input['type'] ?? ''; // 'depot' ou 'retrait'
    $amount = (float)($input['amount'] ?? 0);
    $adminNom = $input['adminNom'] ?? 'Admin';
    $dateStr = $input['date'] ?? date('Y-m-d');

    if (empty($memberId) || empty($type) || $amount <= 0) {
        sendJson(['error' => 'Veuillez fournir un membre, un type d\'opération et un montant valide.'], 400);
    }

    $txId = 'tx_' . time() . '_' . rand(100, 999);
    $now = date('Y-m-d H:i:s');

    $pdo->beginTransaction();

    try {
        // Enregistrer la transaction
        $stmtTx = $pdo->prepare("
            INSERT INTO transactions (id, memberId, memberNom, type, amount, date, timestamp, adminNom)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmtTx->execute([$txId, $memberId, $memberNom, $type, $amount, $dateStr, $now, $adminNom]);

        // Mettre à jour le membre
        if ($type === 'depot') {
            $stmtM = $pdo->prepare("UPDATE members SET totalDepot = totalDepot + ? WHERE id = ?");
        } else {
            $stmtM = $pdo->prepare("UPDATE members SET totalRetrait = totalRetrait + ? WHERE id = ?");
        }
        $stmtM->execute([$amount, $memberId]);

        // Mettre à jour global_stats
        if ($type === 'depot') {
            $stmtStats = $pdo->prepare("UPDATE global_stats SET dailyDepots = dailyDepots + ?, cycleDepots = cycleDepots + ? WHERE id = 1");
        } else {
            $stmtStats = $pdo->prepare("UPDATE global_stats SET dailyRetraits = dailyRetraits + ?, cycleRetraits = cycleRetraits + ? WHERE id = 1");
        }
        $stmtStats->execute([$amount, $amount]);

        $pdo->commit();

        sendJson([
            'id' => $txId,
            'memberId' => $memberId,
            'memberNom' => $memberNom,
            'type' => $type,
            'amount' => $amount,
            'date' => $dateStr,
            'timestamp' => $now,
            'adminNom' => $adminNom
        ]);
    } catch (Exception $e) {
        $pdo->rollBack();
        sendJson(['error' => 'Erreur lors de l\'enregistrement : ' . $e->getMessage()], 500);
    }
}

sendJson(['error' => 'Méthode non autorisée.'], 405);
