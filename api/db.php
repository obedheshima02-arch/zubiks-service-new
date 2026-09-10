<?php
// api/db.php - Connexion PDO à MySQL et helpers de réponse JSON

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Fuseau horaire officiel pour Goma (Nord-Kivu, RDC - UTC+2 / CAT)
date_default_timezone_set('Africa/Lubumbashi');

$host = 'localhost';
$dbname = 'zubiks_db';
$username = 'root';
$password = ''; // Par défaut vide sur Laragon / XAMPP

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);
    $pdo->exec("SET time_zone = '+02:00'");
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Erreur de connexion à la base de données : ' . $e->getMessage()]);
    exit();
}

// Config e-mail transactionnel (Optionnel : Clé API Brevo gratuite si mail() PHP est bloqué par l'hébergeur)
$BREVO_API_KEY = getenv('BREVO_API_KEY') ?: '';

function sendTransactionalEmail($to, $subject, $messageText, $replyTo = 'zubiksservice@gmail.com') {
    global $BREVO_API_KEY;
    if (empty($to)) return false;

    // 1. Envoi par mail() PHP natif
    $domain = $_SERVER['HTTP_HOST'] ?? 'zubiksservice.infinityfreeapp.com';
    $headers = "From: ZUBIKS SERVICE <no-reply@{$domain}>\r\n"
             . "Reply-To: {$replyTo}\r\n"
             . "X-Mailer: PHP/" . phpversion() . "\r\n"
             . "MIME-Version: 1.0\r\n"
             . "Content-Type: text/plain; charset=UTF-8\r\n";
    @mail($to, $subject, $messageText, $headers);

    // 2. Si clé API Brevo configurée : envoi HTTPS garanti avec basculement d'expéditeur validé
    if (!empty($BREVO_API_KEY)) {
        $senders = ["zubiksservice@gmail.com", "obedheshima02@gmail.com"];
        foreach ($senders as $senderEmail) {
            $payload = json_encode([
                "sender" => ["name" => "ZUBIKS SERVICE", "email" => $senderEmail],
                "to" => [["email" => $to]],
                "subject" => $subject,
                "textContent" => $messageText
            ], JSON_UNESCAPED_UNICODE);

            if (function_exists('curl_init')) {
                $ch = curl_init("https://api.brevo.com/v3/smtp/email");
                curl_setopt($ch, CURLOPT_HTTPHEADER, [
                    "api-key: " . $BREVO_API_KEY,
                    "Content-Type: application/json",
                    "Accept: application/json"
                ]);
                curl_setopt($ch, CURLOPT_POST, true);
                curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 5);
                $res = @curl_exec($ch);
                $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);

                if ($code >= 200 && $code < 300) {
                    break;
                }
            }
        }
    }
    return true;
}

function sendJson($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    exit();
}

function getJsonInput() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function parseJsonField($val) {
    if (is_array($val)) return $val;
    if (empty($val)) return [];
    $decoded = json_decode($val, true);
    if (is_string($decoded)) {
        $decoded = json_decode($decoded, true);
    }
    return is_array($decoded) ? $decoded : [];
}

function syncMemberTransactionNotifs($pdo, &$member) {
    if (empty($member['id'])) return;
    $currentNotifs = parseJsonField($member['notifications'] ?? '');
    $memberName = trim($member['nom'] ?? '');
    $stmtTx = $pdo->prepare("SELECT id, type, amount, date, timestamp FROM transactions WHERE TRIM(memberId) = TRIM(?) OR (LOWER(memberNom) = LOWER(?) AND memberNom != '') ORDER BY timestamp ASC");
    $stmtTx->execute([$member['id'], $memberName]);
    $txs = $stmtTx->fetchAll();

    if (empty($txs)) {
        $member['notifications'] = $currentNotifs;
        return;
    }

    $updated = false;
    foreach ($txs as $tx) {
        $notifId = 'notif_tx_' . $tx['id'];
        $formattedAmount = number_format($tx['amount'], 0, ',', ' ') . ' Fc';
        $dateFormatted = date('d/m/Y', strtotime($tx['date']));

        $alreadyExists = false;
        foreach ($currentNotifs as &$cn) {
            $msg = $cn['message'] ?? '';
            $id = $cn['id'] ?? '';
            if ($id === $notifId || $id === $tx['id']) {
                $alreadyExists = true;
                break;
            }
            if (strpos($msg, $formattedAmount) !== false && strpos($msg, $dateFormatted) !== false && strpos($id, 'notif_tx_') !== 0) {
                $cn['id'] = $notifId;
                $alreadyExists = true;
                $updated = true;
                break;
            }
        }
        unset($cn);

        if (!$alreadyExists) {
            if ($tx['type'] === 'depot') {
                $notifText = "💳 Confirmation : Un dépôt de {$formattedAmount} a été effectué sur votre compte le {$dateFormatted}.";
            } else {
                $notifText = "💸 Confirmation : Un retrait de {$formattedAmount} a été effectué sur votre compte le {$dateFormatted}.";
            }

            $currentNotifs[] = [
                'id' => $notifId,
                'message' => $notifText,
                'date' => $tx['timestamp'] ?? date('Y-m-d H:i:s'),
                'read' => false
            ];
            $updated = true;
        }
    }

    if ($updated) {
        $cleanJson = json_encode($currentNotifs, JSON_UNESCAPED_UNICODE);
        $stmtU = $pdo->prepare("UPDATE members SET notifications = ? WHERE id = ?");
        $stmtU->execute([$cleanJson, $member['id']]);
    }

    $member['notifications'] = $currentNotifs;
}

function recalculateTotals($pdo) {
    // 1. Synchroniser le total de chaque membre avec la somme exacte de ses transactions
    $members = $pdo->query("SELECT id, nom FROM members")->fetchAll();
    foreach ($members as $m) {
        $mId = $m['id'];
        $mNom = trim($m['nom']);

        $stmtD = $pdo->prepare("SELECT IFNULL(SUM(amount), 0) FROM transactions WHERE (TRIM(memberId) = TRIM(?) OR (LOWER(memberNom) = LOWER(?) AND memberNom != '')) AND type = 'depot'");
        $stmtD->execute([$mId, $mNom]);
        $depSum = (float)$stmtD->fetchColumn();

        $stmtR = $pdo->prepare("SELECT IFNULL(SUM(amount), 0) FROM transactions WHERE (TRIM(memberId) = TRIM(?) OR (LOWER(memberNom) = LOWER(?) AND memberNom != '')) AND type = 'retrait'");
        $stmtR->execute([$mId, $mNom]);
        $retSum = (float)$stmtR->fetchColumn();

        $stmtU = $pdo->prepare("UPDATE members SET totalDepot = ?, totalRetrait = ? WHERE id = ?");
        $stmtU->execute([$depSum, $retSum, $mId]);
    }

    // 2. Synchroniser les totaux globaux du cycle avec la somme exacte de toutes les transactions
    $totDep = (float)$pdo->query("SELECT IFNULL(SUM(amount), 0) FROM transactions WHERE type = 'depot'")->fetchColumn();
    $totRet = (float)$pdo->query("SELECT IFNULL(SUM(amount), 0) FROM transactions WHERE type = 'retrait'")->fetchColumn();

    $pdo->prepare("UPDATE global_stats SET cycleDepots = ?, cycleRetraits = ? WHERE id = 1")->execute([$totDep, $totRet]);
}
