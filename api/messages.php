<?php
// api/messages.php - API de messagerie interne

require_once __DIR__ . '/db.php';

session_start();
$method = $_SERVER['REQUEST_METHOD'];
$input = getJsonInput();

// GET: Récupérer les messages
if ($method === 'GET') {
    $memberId = $_GET['memberId'] ?? null;
    if ($memberId) {
        $stmt = $pdo->prepare("SELECT * FROM messages WHERE memberId = ? ORDER BY timestamp ASC");
        $stmt->execute([$memberId]);
    } else {
        $stmt = $pdo->query("SELECT * FROM messages ORDER BY timestamp ASC");
    }
    $msgs = $stmt->fetchAll();
    sendJson($msgs);
}

// POST: Envoyer un message ou marquer comme lu
if ($method === 'POST') {
    $action = $_GET['action'] ?? '';

    if ($action === 'mark_read') {
        $memberId = $input['memberId'] ?? '';
        $readBy = $input['readBy'] ?? '';

        if ($readBy === 'user' && !empty($memberId)) {
            $stmt = $pdo->prepare("UPDATE messages SET readByUser = 1 WHERE memberId = ? AND sender = 'admin'");
            $stmt->execute([$memberId]);
            sendJson(['message' => 'Messages marqués comme lus par l\'utilisateur.']);
        } elseif ($readBy === 'admin' && !empty($memberId)) {
            $stmt = $pdo->prepare("UPDATE messages SET readByAdmin = 1 WHERE memberId = ? AND sender = 'user'");
            $stmt->execute([$memberId]);
            sendJson(['message' => 'Messages marqués comme lus par l\'administrateur.']);
        } else {
            sendJson(['error' => 'Paramètres invalides.'], 400);
        }
    }

    $memberId = $input['memberId'] ?? '';
    $sender = $input['sender'] ?? 'user';
    $senderName = $input['senderName'] ?? '';
    $text = trim($input['text'] ?? '');

    if (empty($memberId) || empty($text)) {
        sendJson(['error' => 'Message vide ou membre non spécifié.'], 400);
    }

    $msgId = 'msg_' . time() . '_' . rand(100, 999);
    $now = date('Y-m-d H:i:s');
    $readByAdmin = ($sender === 'admin') ? 1 : 0;
    $readByUser = ($sender === 'user') ? 1 : 0;

    $stmt = $pdo->prepare("
        INSERT INTO messages (id, memberId, sender, senderName, text, timestamp, readByAdmin, readByUser)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([$msgId, $memberId, $sender, $senderName, $text, $now, $readByAdmin, $readByUser]);

    sendJson([
        'id' => $msgId,
        'memberId' => $memberId,
        'sender' => $sender,
        'senderName' => $senderName,
        'text' => $text,
        'timestamp' => $now,
        'readByAdmin' => (bool)$readByAdmin,
        'readByUser' => (bool)$readByUser
    ]);
}

sendJson(['error' => 'Méthode non autorisée.'], 405);
