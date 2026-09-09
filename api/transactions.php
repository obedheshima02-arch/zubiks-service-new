<?php
// api/transactions.php - Gestion des dépôts et retraits cash

require_once __DIR__ . '/db.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
$method = $_SERVER['REQUEST_METHOD'];
$input = getJsonInput();

// GET: Lister les transactions
if ($method === 'GET') {
    $memberId = $_GET['memberId'] ?? null;
    if ($memberId) {
        $stmt = $pdo->prepare("SELECT * FROM transactions WHERE TRIM(memberId) = TRIM(?) ORDER BY timestamp ASC");
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

    // Récupérer les informations du membre pour contrôler les plafonds et le solde
    $stmtMCheck = $pdo->prepare("SELECT id, nom, parts, totalDepot, totalRetrait FROM members WHERE TRIM(id) = TRIM(?) OR LOWER(nom) = LOWER(?)");
    $stmtMCheck->execute([$memberId, $memberNom]);
    $mObj = $stmtMCheck->fetch();

    if ($mObj) {
        $parts = max(1, (int)($mObj['parts'] ?? 1));
        $currentTotalDepot = (float)($mObj['totalDepot'] ?? 0);
        $currentTotalRetrait = (float)($mObj['totalRetrait'] ?? 0);
        $solde = $currentTotalDepot - $currentTotalRetrait;

        $minSingleDepot = 1000;
        $maxTotalDepot = $parts * 63000;

        $minSingleRetrait = 62000; // Minimum fixe de 62 000 Fc peu importe le nombre de parts
        $maxTotalRetrait = $parts * 62000; // Maximum cumulé de N * 62 000 Fc

        if ($type === 'depot') {
            if ($amount < $minSingleDepot) {
                sendJson([
                    'error' => "Dépôt refusé : Le montant minimum pour un dépôt est de " . number_format($minSingleDepot, 0, ',', ' ') . " Fc."
                ], 400);
            }

            if (($currentTotalDepot + $amount) > $maxTotalDepot) {
                $resteDepot = max(0, $maxTotalDepot - $currentTotalDepot);
                sendJson([
                    'error' => "Dépôt refusé : Pour {$parts} part(s), le cumul maximal de dépôt pour un cycle (63 jours) est de " . number_format($maxTotalDepot, 0, ',', ' ') . " Fc. Reste autorisé : " . number_format($resteDepot, 0, ',', ' ') . " Fc."
                ], 400);
            }
        } elseif ($type === 'retrait') {
            if ($amount < $minSingleRetrait) {
                sendJson([
                    'error' => "Retrait refusé : Le montant minimum à retirer est de 62 000 Fc."
                ], 400);
            }

            if (($currentTotalRetrait + $amount) > $maxTotalRetrait) {
                $resteRetrait = max(0, $maxTotalRetrait - $currentTotalRetrait);
                sendJson([
                    'error' => "Retrait refusé : Pour {$parts} part(s), le plafond maximal cumulé de retrait est de " . number_format($maxTotalRetrait, 0, ',', ' ') . " Fc. Reste autorisé : " . number_format($resteRetrait, 0, ',', ' ') . " Fc."
                ], 400);
            }
        }
    }

    $txId = 'tx_' . time() . '_' . rand(100, 999);
    $now = date('Y-m-d H:i:s');

    $targetMemberId = $mObj ? $mObj['id'] : $memberId;
    $targetMemberNom = $mObj ? $mObj['nom'] : $memberNom;

    $pdo->beginTransaction();

    try {
        // Enregistrer la transaction
        $stmtTx = $pdo->prepare("
            INSERT INTO transactions (id, memberId, memberNom, type, amount, date, timestamp, adminNom)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmtTx->execute([$txId, $targetMemberId, $targetMemberNom, $type, $amount, $dateStr, $now, $adminNom]);

        // Mettre à jour le membre
        if ($type === 'depot') {
            $stmtM = $pdo->prepare("UPDATE members SET totalDepot = totalDepot + ? WHERE id = ?");
        } else {
            $stmtM = $pdo->prepare("UPDATE members SET totalRetrait = totalRetrait + ? WHERE id = ?");
        }
        $stmtM->execute([$amount, $targetMemberId]);

        // Mettre à jour global_stats
        if ($type === 'depot') {
            $stmtStats = $pdo->prepare("UPDATE global_stats SET dailyDepots = dailyDepots + ?, cycleDepots = cycleDepots + ? WHERE id = 1");
        } else {
            $stmtStats = $pdo->prepare("UPDATE global_stats SET dailyRetraits = dailyRetraits + ?, cycleRetraits = cycleRetraits + ? WHERE id = 1");
        }
        $stmtStats->execute([$amount, $amount]);

        // Générer notification & message de confirmation pour le membre
        $stmtMInfo = $pdo->prepare("SELECT id, notifications FROM members WHERE id = ?");
        $stmtMInfo->execute([$targetMemberId]);
        $mRow = $stmtMInfo->fetch();

        if ($mRow !== false) {
            $currentNotifs = parseJsonField($mRow['notifications'] ?? '');
            $formattedAmount = number_format($amount, 0, ',', ' ') . ' Fc';
            $dateFormatted = date('d/m/Y', strtotime($dateStr));

            if ($type === 'depot') {
                $notifText = "💳 Confirmation : Un dépôt de {$formattedAmount} a été effectué sur votre compte le {$dateFormatted}.";
                $chatText = "💳 CONFIRMATION DE DÉPÔT : Votre compte a été crédité de {$formattedAmount} le {$dateFormatted} par l'administration ($adminNom).";
            } else {
                $notifText = "💸 Confirmation : Un retrait de {$formattedAmount} a été effectué sur votre compte le {$dateFormatted}.";
                $chatText = "💸 CONFIRMATION DE RETRAIT : Un retrait de {$formattedAmount} a été effectué sur votre compte le {$dateFormatted} par l'administration ($adminNom).";
            }

            $notifId = 'notif_tx_' . $txId;
            $newNotif = [
                'id' => $notifId,
                'message' => $notifText,
                'date' => $now,
                'read' => false
            ];
            $currentNotifs[] = $newNotif;

            $stmtUpdateNotif = $pdo->prepare("UPDATE members SET notifications = ? WHERE id = ?");
            $stmtUpdateNotif->execute([json_encode($currentNotifs, JSON_UNESCAPED_UNICODE), $targetMemberId]);

            // Envoyer le message automatique dans la messagerie
            $msgId = 'msg_' . time() . '_' . rand(100, 999);
            $stmtMsg = $pdo->prepare("
                INSERT INTO messages (id, memberId, sender, senderName, text, timestamp, readByAdmin, readByUser)
                VALUES (?, ?, 'admin', ?, ?, ?, 1, 0)
            ");
            $stmtMsg->execute([$msgId, $targetMemberId, $adminNom, $chatText, $now]);
        }

        $pdo->commit();

        recalculateTotals($pdo);

        sendJson([
            'id' => $txId,
            'memberId' => $targetMemberId,
            'memberNom' => $targetMemberNom,
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
