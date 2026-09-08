<?php
// api/auth.php - API d'authentification et gestion de session

require_once __DIR__ . '/db.php';

session_start();

$action = $_GET['action'] ?? '';
$input = getJsonInput();

if ($action === 'login') {
    $email = strtolower(trim($input['email'] ?? ''));
    $password = $input['password'] ?? '';

    if (empty($email) || empty($password)) {
        sendJson(['error' => 'Veuillez remplir tous les champs.'], 400);
    }

    // Récupérer les identifiants administrateur dans global_stats
    $stmtStats = $pdo->query("SELECT admin_email, admin_password FROM global_stats WHERE id = 1");
    $stats = $stmtStats->fetch();
    $adminEmail = strtolower(trim($stats['admin_email'] ?? 'zubiksservice@gmail.com'));

    if ($email === $adminEmail) {
        // Vérification du mot de passe admin (si défini, sinon accepter par défaut ou vérifier hash)
        if (!empty($stats['admin_password'])) {
            if (!password_verify($password, $stats['admin_password'])) {
                sendJson(['error' => 'Email ou mot de passe incorrect.'], 401);
            }
        }
        $user = [
            'id' => 'admin_main',
            'nom' => 'Admin ZUBIKS',
            'email' => $adminEmail,
            'role' => 'admin',
            'status' => 'active'
        ];
        $_SESSION['user'] = $user;
        sendJson(['user' => $user, 'message' => 'Connexion administrateur réussie.']);
    }

    // Recherche membre / utilisateur normal
    $stmt = $pdo->prepare("SELECT * FROM members WHERE LOWER(email) = ?");
    $stmt->execute([$email]);
    $member = $stmt->fetch();

    if ($member) {
        if (!empty($member['password'])) {
            if (!password_verify($password, $member['password'])) {
                sendJson(['error' => 'Email ou mot de passe incorrect.'], 401);
            }
        }
        unset($member['password']);
        if (!empty($member['notifications'])) {
            $member['notifications'] = json_decode($member['notifications'], true) ?: [];
        } else {
            $member['notifications'] = [];
        }

        $_SESSION['user'] = $member;
        sendJson(['user' => $member, 'message' => 'Connexion réussie.']);
    }

    sendJson(['error' => 'Email ou mot de passe incorrect.'], 401);
}

if ($action === 'register' || $action === 'signup') {
    $nom = trim($input['nom'] ?? '');
    $postnom = trim($input['postnom'] ?? '');
    $sexe = $input['sexe'] ?? 'M';
    $email = strtolower(trim($input['email'] ?? ''));
    $password = $input['password'] ?? '';
    $requestedRole = $input['role'] ?? 'user';
    $status = ($requestedRole === 'admin_second') ? 'active' : 'pending';
    $parts = (int)($input['parts'] ?? 0);

    if (empty($nom) || empty($email) || empty($password)) {
        sendJson(['error' => 'Veuillez remplir tous les champs obligatoires.'], 400);
    }

    // Vérifier si l'email existe déjà
    $stmtCheck = $pdo->prepare("SELECT id FROM members WHERE LOWER(email) = ?");
    $stmtCheck->execute([$email]);
    if ($stmtCheck->fetch()) {
        sendJson(['error' => 'Cet e-mail est déjà utilisé par un autre compte.'], 400);
    }

    $newId = 'usr_' . time() . '_' . rand(100, 999);
    $hashedPassword = password_hash($password, PASSWORD_BCRYPT);
    $now = date('Y-m-d H:i:s');
    $initialNotif = json_encode([[
        'id' => (string)time(),
        'message' => 'Bienvenue sur ZUBIX SERVICE !',
        'date' => $now,
        'read' => false
    ]]);

    $stmtInsert = $pdo->prepare("
        INSERT INTO members (id, nom, postnom, sexe, email, password, role, status, parts, totalDepot, totalRetrait, dateAjout, notifications)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    ");
    $stmtInsert->execute([$newId, $nom, $postnom, $sexe, $email, $hashedPassword, $requestedRole, $status, $parts, $now, $initialNotif]);

    $userObj = [
        'id' => $newId,
        'nom' => $nom,
        'postnom' => $postnom,
        'email' => $email,
        'role' => $requestedRole,
        'status' => $status,
        'parts' => $parts
    ];

    sendJson([
        'message' => ($status === 'active') ? 'Compte créé avec succès !' : 'Inscription réussie ! Votre compte est en attente de validation.',
        'userId' => $newId,
        'user' => $userObj
    ]);
}

if ($action === 'check') {
    if (!empty($_SESSION['user'])) {
        sendJson(['user' => $_SESSION['user']]);
    } else {
        sendJson(['user' => null]);
    }
}

if ($action === 'logout') {
    unset($_SESSION['user']);
    session_destroy();
    sendJson(['message' => 'Déconnecté avec succès.']);
}

sendJson(['error' => 'Action inconnue.'], 400);
