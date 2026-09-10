<?php
// api/test_mail.php - Script de test et diagnostic d'envoi d'e-mail Brevo
require_once 'db.php';

header('Content-Type: text/html; charset=utf-8');

$testEmail = $_GET['email'] ?? 'obedheshima02@gmail.com';
$testSubject = "🔒 ZUBIKS SERVICE - Test d'envoi e-mail (" . date('H:i:s') . ")";
$testMessage = "Bonjour,\n\nCeci est un e-mail de test pour vérifier la délivrabilité automatique des codes OTP et des notifications sur ZUBIKS SERVICE.\n\nCode de test : " . rand(100000, 999999) . "\n\nCordialement,\nZubiks Service";

echo "<!DOCTYPE html><html lang='fr'><head><meta charset='UTF-8'><title>Test Mail - Zubiks</title>";
echo "<style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;padding:40px;line-height:1.6;}.card{background:#1e293b;padding:30px;border-radius:12px;max-width:600px;margin:0 auto;border:1px solid #334155;}h2{color:#38bdf8;}.code{background:#090d16;padding:15px;border-radius:8px;font-family:monospace;color:#a7f3d0;word-break:break-all;}</style></head><body>";
echo "<div class='card'><h2>📧 Diagnostic d'envoi d'e-mail ZUBIKS</h2>";
echo "<p>Tentative d'envoi vers : <b>" . htmlspecialchars($testEmail) . "</b></p>";

global $BREVO_API_KEY;
if (empty($BREVO_API_KEY)) {
    echo "<p style='color:#f87171;'>⚠️ La clé \$BREVO_API_KEY est vide dans api/db.php.</p>";
} else {
    echo "<p style='color:#34d399;'>✅ Clé Brevo présente dans api/db.php (" . substr($BREVO_API_KEY, 0, 15) . "...)</p>";
}

// Essai avec l'expéditeur Brevo
$sendersToTry = [
    "zubiksservice@gmail.com",
    "obedheshima02@gmail.com"
];

$success = false;
foreach ($sendersToTry as $senderEmail) {
    echo "<h3>Essai d'envoi avec l'expéditeur : <code>$senderEmail</code></h3>";
    $payload = json_encode([
        "sender" => ["name" => "ZUBIKS SERVICE", "email" => $senderEmail],
        "to" => [["email" => $testEmail]],
        "subject" => $testSubject,
        "textContent" => $testMessage
    ], JSON_UNESCAPED_UNICODE);

    $ch = curl_init("https://api.brevo.com/v3/smtp/email");
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "api-key: " . $BREVO_API_KEY,
        "Content-Type: application/json",
        "Accept: application/json"
    ]);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    echo "<div class='code'>";
    echo "<b>HTTP Code :</b> " . $httpCode . "<br>";
    if ($curlErr) echo "<b>cURL Error :</b> " . htmlspecialchars($curlErr) . "<br>";
    echo "<b>Réponse Brevo :</b> " . htmlspecialchars($response);
    echo "</div>";

    if ($httpCode >= 200 && $httpCode < 300) {
        echo "<h3 style='color:#34d399;'>🎉 SUCCÈS ! L'e-mail a été accepté par Brevo. Consultez la boîte de réception ou les Spams de $testEmail.</h3>";
        $success = true;
        break;
    }
}

if (!$success) {
    echo "<h3 style='color:#f87171;'>❌ Échec de l'envoi. Vérifiez si l'adresse expéditeur est validée dans Brevo.</h3>";
}

echo "<br><a href='../public/' style='color:#38bdf8;'>← Retour à l'application</a></div></body></html>";
