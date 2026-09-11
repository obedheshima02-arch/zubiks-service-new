<?php
// api/messages.php - API de messagerie interne

require_once __DIR__ . '/db.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
$method = $_SERVER['REQUEST_METHOD'];
$input = getJsonInput();

// GET: Récupérer les messages
if ($method === 'GET') {
    $memberId = $_GET['memberId'] ?? null;
    if ($memberId) {
        $stmtM = $pdo->prepare("SELECT id, nom FROM members WHERE TRIM(id) = TRIM(?) OR LOWER(nom) = LOWER(?)");
        $stmtM->execute([$memberId, $memberId]);
        $mRow = $stmtM->fetch();
        $targetId = $mRow ? $mRow['id'] : $memberId;
        $targetNom = $mRow ? $mRow['nom'] : '';

        $stmt = $pdo->prepare("SELECT * FROM messages WHERE TRIM(memberId) = TRIM(?) OR (LOWER(senderName) = LOWER(?) AND sender = 'user') ORDER BY timestamp ASC");
        $stmt->execute([$targetId, $targetNom]);
    } else {
        $stmt = $pdo->query("SELECT * FROM messages ORDER BY timestamp ASC");
    }
    $msgs = $stmt->fetchAll();
    sendJson($msgs);
}

// POST: Envoyer un message ou marquer comme lu
if ($method === 'POST') {
    $action = $_GET['action'] ?? ($input['action'] ?? '');

    if ($action === 'mark_read') {
        $memberId = $input['memberId'] ?? '';
        $readBy = $input['readBy'] ?? '';

        $stmtM = $pdo->prepare("SELECT id FROM members WHERE TRIM(id) = TRIM(?) OR LOWER(nom) = LOWER(?)");
        $stmtM->execute([$memberId, $memberId]);
        $mRow = $stmtM->fetch();
        $targetId = $mRow ? $mRow['id'] : $memberId;

        if ($readBy === 'user' && !empty($targetId)) {
            $stmt = $pdo->prepare("UPDATE messages SET readByUser = 1 WHERE TRIM(memberId) = TRIM(?) AND sender = 'admin'");
            $stmt->execute([$targetId]);
            sendJson(['message' => 'Messages marqués comme lus par l\'utilisateur.']);
        } elseif ($readBy === 'admin' && !empty($targetId)) {
            $stmt = $pdo->prepare("UPDATE messages SET readByAdmin = 1 WHERE TRIM(memberId) = TRIM(?) AND sender = 'user'");
            $stmt->execute([$targetId]);
            sendJson(['message' => 'Messages marqués comme lus par l\'administrateur.']);
        } else {
            sendJson(['error' => 'Paramètres invalides.'], 400);
        }
    }

    if ($action === 'broadcast') {
        $text = trim($input['text'] ?? '');
        $senderName = $input['senderName'] ?? 'Administration';
        if (empty($text)) {
            sendJson(['error' => 'Le contenu de l\'annonce est vide.'], 400);
        }

        $stmtM = $pdo->query("SELECT id FROM members WHERE (status = 'active' OR status IS NULL OR status != 'pending') AND (role IS NULL OR role NOT IN ('admin', 'admin_second'))");
        $members = $stmtM->fetchAll();

        if (empty($members)) {
            sendJson(['error' => 'Aucun membre actif trouvé.'], 400);
        }

        $now = date('Y-m-d H:i:s');
        $count = 0;

        $pdo->beginTransaction();
        try {
            $stmtIns = $pdo->prepare("
                INSERT INTO messages (id, memberId, sender, senderName, text, timestamp, readByAdmin, readByUser)
                VALUES (?, ?, 'admin', ?, ?, ?, 1, 0)
            ");
            foreach ($members as $m) {
                $msgId = 'msg_' . time() . '_' . rand(100, 999) . '_' . rand(10, 99);
                $stmtIns->execute([$msgId, $m['id'], $senderName, $text, $now]);
                $count++;
            }
            $pdo->commit();
            sendJson(['message' => "Annonce diffusée à $count membre(s).", 'count' => $count]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            sendJson(['error' => 'Erreur lors de la diffusion : ' . $e->getMessage()], 500);
        }
    }

    $memberId = $input['memberId'] ?? '';
    $sender = $input['sender'] ?? 'user';
    $senderName = $input['senderName'] ?? '';
    $text = trim($input['text'] ?? '');

    if (empty($memberId) || empty($text)) {
        sendJson(['error' => 'Message vide ou membre non spécifié.'], 400);
    }

    // Résolution canonique du membre
    $stmtM = $pdo->prepare("SELECT id, nom FROM members WHERE TRIM(id) = TRIM(?) OR LOWER(nom) = LOWER(?)");
    $stmtM->execute([$memberId, $memberId]);
    $mRow = $stmtM->fetch();

    $canonicalMemberId = $mRow ? $mRow['id'] : $memberId;
    if (empty($senderName) && $mRow) {
        $senderName = $mRow['nom'];
    }

    $msgId = 'msg_' . time() . '_' . rand(100, 999);
    $now = date('Y-m-d H:i:s');
    $readByAdmin = ($sender === 'admin') ? 1 : 0;
    $readByUser = ($sender === 'user') ? 1 : 0;

    $stmt = $pdo->prepare("
        INSERT INTO messages (id, memberId, sender, senderName, text, timestamp, readByAdmin, readByUser)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([$msgId, $canonicalMemberId, $sender, $senderName, $text, $now, $readByAdmin, $readByUser]);

    sendJson([
        'id' => $msgId,
        'memberId' => $canonicalMemberId,
        'sender' => $sender,
        'senderName' => $senderName,
        'text' => $text,
        'timestamp' => $now,
        'readByAdmin' => (bool)$readByAdmin,
        'readByUser' => (bool)$readByUser
    ]);
}

sendJson(['error' => 'Méthode non autorisée.'], 405);
