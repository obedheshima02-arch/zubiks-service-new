<?php
// api/members.php - CRUD des membres

require_once __DIR__ . '/db.php';

session_start();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$input = getJsonInput();

// GET: Récupérer tous les membres (Admin) ou un membre spécifique
if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    if ($id) {
        $stmt = $pdo->prepare("SELECT id, nom, postnom, sexe, email, role, status, parts, totalDepot, totalRetrait, dateAjout, profilePhoto, notifications FROM members WHERE id = ?");
        $stmt->execute([$id]);
        $m = $stmt->fetch();
        if ($m) {
            $m['notifications'] = !empty($m['notifications']) ? (json_decode($m['notifications'], true) ?: []) : [];
            sendJson($m);
        } else {
            sendJson(['error' => 'Membre introuvable.'], 404);
        }
    } else {
        $stmt = $pdo->query("SELECT id, nom, postnom, sexe, email, role, status, parts, totalDepot, totalRetrait, dateAjout, profilePhoto, notifications FROM members ORDER BY nom ASC");
        $members = $stmt->fetchAll();
        foreach ($members as &$m) {
            $m['notifications'] = !empty($m['notifications']) ? (json_decode($m['notifications'], true) ?: []) : [];
        }
        sendJson($members);
    }
}

// POST: Ajouter un membre manuellement par l'admin
if ($method === 'POST') {
    if ($action === 'add') {
        $nom = trim($input['nom'] ?? '');
        $parts = (int)($input['parts'] ?? 1);

        if (empty($nom) || $parts < 1) {
            sendJson(['error' => 'Nom et nombre de parts valides requis.'], 400);
        }

        $newId = (string)time();
        $now = date('Y-m-d H:i:s');
        $notifications = json_encode([]);

        $stmt = $pdo->prepare("
            INSERT INTO members (id, nom, parts, role, status, totalDepot, totalRetrait, dateAjout, notifications)
            VALUES (?, ?, ?, 'user', 'active', 0, 0, ?, ?)
        ");
        $stmt->execute([$newId, $nom, $parts, $now, $notifications]);

        sendJson([
            'id' => $newId,
            'nom' => $nom,
            'parts' => $parts,
            'role' => 'user',
            'status' => 'active',
            'totalDepot' => 0,
            'totalRetrait' => 0,
            'dateAjout' => $now,
            'notifications' => []
        ]);
    }

    if ($action === 'validate') {
        $id = $input['id'] ?? '';
        $parts = (int)($input['parts'] ?? 1);

        if (empty($id) || $parts < 1) {
            sendJson(['error' => 'ID et nombre de parts valides requis.'], 400);
        }

        $stmtSelect = $pdo->prepare("SELECT notifications FROM members WHERE id = ?");
        $stmtSelect->execute([$id]);
        $m = $stmtSelect->fetch();

        $currentNotifs = !empty($m['notifications']) ? (json_decode($m['notifications'], true) ?: []) : [];
        $newNotif = [
            'id' => (string)time(),
            'message' => "🎉 Votre compte a été validé par l'administrateur avec $parts part(s) attribuée(s). Vous pouvez désormais effectuer vos opérations cash !",
            'date' => date('Y-m-d H:i:s'),
            'read' => false
        ];
        $currentNotifs[] = $newNotif;

        $stmt = $pdo->prepare("UPDATE members SET parts = ?, status = 'active', notifications = ? WHERE id = ?");
        $stmt->execute([$parts, json_encode($currentNotifs), $id]);

        sendJson(['message' => 'Membre validé avec succès.']);
    }
}

// PUT / POST update: Modifier les informations d'un membre
if ($method === 'PUT' || ($method === 'POST' && $action === 'update')) {
    $id = $input['id'] ?? '';
    $nom = trim($input['nom'] ?? '');
    $parts = (int)($input['parts'] ?? 0);

    if (empty($id) || empty($nom) || $parts < 1) {
        sendJson(['error' => 'Données invalides.'], 400);
    }

    $stmt = $pdo->prepare("UPDATE members SET nom = ?, parts = ? WHERE id = ?");
    $stmt->execute([$nom, $parts, $id]);

    sendJson(['message' => 'Membre mis à jour avec succès.']);
}

// DELETE: Supprimer un membre
if ($method === 'DELETE' || ($method === 'POST' && $action === 'delete')) {
    $id = $_GET['id'] ?? ($input['id'] ?? '');

    if (empty($id)) {
        sendJson(['error' => 'ID du membre requis.'], 400);
    }

    $stmt = $pdo->prepare("DELETE FROM members WHERE id = ?");
    $stmt->execute([$id]);

    sendJson(['message' => 'Membre supprimé avec succès.']);
}

sendJson(['error' => 'Méthode non autorisée.'], 405);
