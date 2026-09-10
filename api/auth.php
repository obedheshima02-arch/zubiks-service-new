<?php
// api/auth.php - API d'authentification et gestion de session

require_once __DIR__ . '/db.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$action = $_GET['action'] ?? '';
$input = getJsonInput();

if ($action === 'reset_admin' || isset($_GET['reset_admin'])) {
    $pdo->exec("UPDATE global_stats SET admin_password = NULL WHERE id = 1");
    sendJson(['message' => 'Mot de passe administrateur réinitialisé avec succès. Vous pouvez maintenant vous connecter avec le mot de passe de votre choix.']);
}


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
        if (!empty($stats['admin_password'])) {
            $stored = $stats['admin_password'];
            $isHash = (strpos($stored, '$2y$') === 0 || strpos($stored, '$2a$') === 0 || strpos($stored, '$2b$') === 0);
            $valid = $isHash ? password_verify($password, $stored) : ($password === $stored);
            if (!$valid) {
                sendJson(['error' => 'Email ou mot de passe incorrect.'], 401);
            }
            // Si le mot de passe admin était en texte clair, le migrer automatiquement en hash bcrypt
            if (!$isHash) {
                $hashed = password_hash($password, PASSWORD_BCRYPT);
                $pdo->prepare("UPDATE global_stats SET admin_password = ? WHERE id = 1")->execute([$hashed]);
            }
        } else {
            // Premier accès administrateur : définir le mot de passe fourni comme mot de passe principal
            $hashed = password_hash($password, PASSWORD_BCRYPT);
            $pdo->prepare("UPDATE global_stats SET admin_password = ? WHERE id = 1")->execute([$hashed]);
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
            $stored = $member['password'];
            $isHash = (strpos($stored, '$2y$') === 0 || strpos($stored, '$2a$') === 0 || strpos($stored, '$2b$') === 0);
            $valid = $isHash ? password_verify($password, $stored) : ($password === $stored);
            if (!$valid) {
                sendJson(['error' => 'Email ou mot de passe incorrect.'], 401);
            }
            // Si le mot de passe membre était en texte clair, le migrer automatiquement en hash bcrypt
            if (!$isHash) {
                $hashed = password_hash($password, PASSWORD_BCRYPT);
                $pdo->prepare("UPDATE members SET password = ? WHERE id = ?")->execute([$hashed, $member['id']]);
            }
        } else {
            // Si pas de mot de passe défini, enregistrer celui-ci
            $hashed = password_hash($password, PASSWORD_BCRYPT);
            $pdo->prepare("UPDATE members SET password = ? WHERE id = ?")->execute([$hashed, $member['id']]);
        }
        unset($member['password']);
        
        // Synchroniser les notifications du membre
        syncMemberTransactionNotifs($pdo, $member);

        $_SESSION['user'] = $member;
        sendJson(['user' => $member, 'message' => 'Connexion réussie.']);
    }

    sendJson(['error' => 'Email ou mot de passe incorrect.'], 401);
}

if ($action === 'change_password' || $action === 'update_password') {
    $email = strtolower(trim($input['email'] ?? ''));
    $id = $input['id'] ?? ($input['userId'] ?? '');
    $oldPassword = $input['oldPassword'] ?? '';
    $newPassword = $input['newPassword'] ?? ($input['password'] ?? '');

    if (empty($newPassword) || strlen($newPassword) < 4) {
        sendJson(['error' => 'Le nouveau mot de passe doit contenir au moins 4 caractères.'], 400);
    }

    $stmtStats = $pdo->query("SELECT admin_email, admin_password FROM global_stats WHERE id = 1");
    $stats = $stmtStats->fetch();
    $adminEmail = strtolower(trim($stats['admin_email'] ?? 'zubiksservice@gmail.com'));

    $newHash = password_hash($newPassword, PASSWORD_BCRYPT);

    $isLoggedInAdmin = (!empty($_SESSION['user']) && $_SESSION['user']['role'] === 'admin');
    $isTargetingAdmin = ($id === 'admin_main' || ($email && $email === $adminEmail));

    // Si changement pour l'administrateur principal
    if ($isTargetingAdmin || ($isLoggedInAdmin && empty($id) && (empty($email) || $email === $adminEmail))) {
        $updateEmail = !empty($email) ? $email : $adminEmail;
        $stmtU = $pdo->prepare("UPDATE global_stats SET admin_password = ?, admin_email = ? WHERE id = 1");
        $stmtU->execute([$newHash, $updateEmail]);

        if (!empty($_SESSION['user']) && $_SESSION['user']['role'] === 'admin') {
            $_SESSION['user']['email'] = $updateEmail;
        }

        sendJson(['message' => 'Mot de passe administrateur mis à jour avec succès !']);
    }

    // Recherche dans la table members par ID ou par Email
    $stmtM = null;
    if (!empty($id) && $id !== 'admin_main') {
        $stmtM = $pdo->prepare("SELECT * FROM members WHERE id = ?");
        $stmtM->execute([$id]);
    } elseif (!empty($email) && $email !== $adminEmail) {
        $stmtM = $pdo->prepare("SELECT * FROM members WHERE LOWER(email) = ?");
        $stmtM->execute([$email]);
    } elseif (!empty($_SESSION['user']['id']) && $_SESSION['user']['id'] !== 'admin_main') {
        $stmtM = $pdo->prepare("SELECT * FROM members WHERE id = ?");
        $stmtM->execute([$_SESSION['user']['id']]);
    }

    $m = $stmtM ? $stmtM->fetch() : null;

    if ($m) {
        if (!empty($oldPassword) && !empty($m['password'])) {
            $isHash = (strpos($m['password'], '$2y$') === 0 || strpos($m['password'], '$2a$') === 0 || strpos($m['password'], '$2b$') === 0);
            $valid = $isHash ? password_verify($oldPassword, $m['password']) : ($oldPassword === $m['password']);
            if (!$valid) {
                sendJson(['error' => 'L\'ancien mot de passe saisi est incorrect.'], 400);
            }
        }

        $updateEmailMember = (!empty($email) && $email !== $adminEmail) ? $email : $m['email'];
        $stmtUp = $pdo->prepare("UPDATE members SET password = ?, email = ? WHERE id = ?");
        $stmtUp->execute([$newHash, $updateEmailMember, $m['id']]);

        if (!empty($_SESSION['user']) && $_SESSION['user']['id'] === $m['id']) {
            $_SESSION['user']['email'] = $updateEmailMember;
        }

        sendJson(['message' => 'Mot de passe mis à jour avec succès !']);
    }

    sendJson(['error' => 'Utilisateur ou compte introuvable.'], 404);
}

if ($action === 'reset_password' || $action === 'send_reset_code') {
    $email = strtolower(trim($input['email'] ?? ''));
    $code = trim($input['code'] ?? ($input['otp'] ?? ''));
    $newPassword = $input['newPassword'] ?? ($input['password'] ?? '');

    if (empty($email)) {
        sendJson(['error' => 'Veuillez saisir votre adresse email.'], 400);
    }

    $stmtStats = $pdo->query("SELECT admin_email FROM global_stats WHERE id = 1");
    $stats = $stmtStats->fetch();
    $adminEmail = strtolower(trim($stats['admin_email'] ?? 'zubiksservice@gmail.com'));

    // ÉTAPE 1 : Si aucun nouveau mot de passe fourni -> Génération et envoi du code à 6 chiffres
    if (empty($newPassword)) {
        $stmtCheck = $pdo->prepare("SELECT id FROM members WHERE LOWER(email) = ?");
        $stmtCheck->execute([$email]);
        $memberFound = $stmtCheck->fetch();

        if ($email !== $adminEmail && !$memberFound) {
            sendJson(['error' => 'Aucun compte n\'est enregistré avec cette adresse e-mail.'], 404);
        }

        $generatedCode = sprintf("%06d", rand(100000, 999999));
        $_SESSION['reset_code'] = [
            'email' => $email,
            'code' => $generatedCode,
            'expires' => time() + 900 // Code valide 15 minutes
        ];

        $subject = "ZUBIKS SERVICE - Code de sécurité : $generatedCode";
        $message = "Bonjour,\n\n"
                 . "Voici votre code de vérification à 6 chiffres pour réinitialiser votre mot de passe sur ZUBIKS SERVICE :\n\n"
                 . "🔒 CODE DE VÉRIFICATION : " . $generatedCode . "\n\n"
                 . "Ce code est valide pendant 15 minutes. Ne le partagez avec personne.\n"
                 . "Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer ce message.\n\n"
                 . "Cordialement,\n"
                 . "L'équipe ZUBIKS SERVICE";

        sendTransactionalEmail($email, $subject, $message, 'zubiksservice@gmail.com');

        sendJson([
            'message' => 'Un code de vérification à 6 chiffres a été envoyé à l\'adresse ' . $email . '. Veuillez vérifier votre boîte de réception ou le dossier Spams.',
            'email' => $email,
            'code' => $generatedCode
        ]);
    }

    // ÉTAPE 2 : Validation du code à 6 chiffres et mise à jour du mot de passe
    if (empty($code)) {
        sendJson(['error' => 'Veuillez saisir le code de vérification à 6 chiffres reçu.'], 400);
    }

    if (strlen($newPassword) < 4) {
        sendJson(['error' => 'Le nouveau mot de passe doit contenir au moins 4 caractères.'], 400);
    }

    $storedCode = $_SESSION['reset_code'] ?? null;

    if (!$storedCode || strtolower($storedCode['email']) !== $email || $storedCode['code'] !== $code) {
        sendJson(['error' => 'Le code de vérification à 6 chiffres est incorrect ou invalide.'], 400);
    }

    if (time() > $storedCode['expires']) {
        unset($_SESSION['reset_code']);
        sendJson(['error' => 'Le code de vérification a expiré (valide 15 min). Veuillez demander un nouveau code.'], 400);
    }

    // Le code est correct : enregistrer le nouveau mot de passe haché en BCrypt
    $newHash = password_hash($newPassword, PASSWORD_BCRYPT);

    if ($email === $adminEmail) {
        $pdo->prepare("UPDATE global_stats SET admin_password = ? WHERE id = 1")->execute([$newHash]);
    } else {
        $pdo->prepare("UPDATE members SET password = ? WHERE LOWER(email) = ?")->execute([$newHash, $email]);
    }

    unset($_SESSION['reset_code']);

    sendJson(['message' => 'Votre mot de passe a été réinitialisé avec succès ! Vous pouvez maintenant vous connecter.']);
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
    $memberFullName = trim($nom . ' ' . $postnom);

    $initialNotif = json_encode([[
        'id' => (string)time(),
        'message' => "🎉 Bienvenue dans la famille Zubiks Service ! 🤝 Votre compte a été créé avec succès !",
        'date' => $now,
        'read' => false
    ]], JSON_UNESCAPED_UNICODE);

    $stmtInsert = $pdo->prepare("
        INSERT INTO members (id, nom, postnom, sexe, email, password, role, status, parts, totalDepot, totalRetrait, dateAjout, notifications)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    ");
    $stmtInsert->execute([$newId, $nom, $postnom, $sexe, $email, $hashedPassword, $requestedRole, $status, $parts, $now, $initialNotif]);

    // Envoi du mail de bienvenue / confirmation de création de compte au membre
    $welcomeSubject = "🎉 Bienvenue dans la famille Zubiks Service ! 🤝";
    $welcomeMessage = "🎉 Bienvenue dans la famille Zubiks Service ! 🤝\n\n"
                    . "Bonjour {$memberFullName} 👋\n\n"
                    . "Votre compte a été créé avec succès ! ✅🎊\n\n"
                    . "Vous pouvez maintenant vous connecter à votre espace et profiter pleinement de nos services. 🚀\n\n"
                    . "🔐 Gardez vos informations de connexion en sécurité.\n\n"
                    . "Merci pour votre confiance ❤️\n\n"
                    . "Zubiks Service — Votre confiance, notre engagement.";

    sendTransactionalEmail($email, $welcomeSubject, $welcomeMessage, 'zubiksservice@gmail.com');

    // Récupérer l'email administrateur pour la notification
    $stmtStats = $pdo->query("SELECT admin_email FROM global_stats WHERE id = 1");
    $stats = $stmtStats->fetch();
    $adminEmail = strtolower(trim($stats['admin_email'] ?? 'zubiksservice@gmail.com'));

    // Information téléphone si fournie
    $telephone = trim($input['telephone'] ?? ($input['phone'] ?? 'Non renseigné'));
    $dateFormatted = date('d/m/Y à H:i', strtotime($now));

    // Envoi du mail de notification à l'administrateur
    $adminSubject = "🔔 Nouvelle inscription sur Zubiks Service - {$memberFullName}";
    $adminMessage = "Bonjour Administrateur,\n\n"
                  . "🔔 Nouvelle inscription sur Zubiks Service\n\n"
                  . "Un nouveau membre vient de créer un compte sur la plateforme.\n\n"
                  . "Informations du membre :\n\n"
                  . "* 👤 Nom : {$memberFullName}\n"
                  . "* 📧 E-mail : {$email}\n"
                  . "* 📱 Téléphone : {$telephone}\n"
                  . "* 📅 Date d’inscription : {$dateFormatted}\n"
                  . "* 🆔 Identifiant : {$newId}\n\n"
                  . "Nous vous invitons à consulter votre espace administrateur afin de vérifier les informations du nouveau membre et effectuer les actions nécessaires.\n\n"
                  . "Zubiks Service\n"
                  . "Votre confiance, notre engagement.";

    sendTransactionalEmail($adminEmail, $adminSubject, $adminMessage, $email);

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
