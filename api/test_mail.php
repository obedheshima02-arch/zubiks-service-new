<?php
// api/test_mail.php - Script de test et diagnostic d'envoi d'e-mail EmailJS
require_once 'db.php';

header('Content-Type: text/html; charset=utf-8');

$testEmail = $_GET['email'] ?? 'obedheshima02@gmail.com';
$testSubject = "🔒 ZUBIKS SERVICE - Test d'envoi e-mail (" . date('H:i:s') . ")";
$testMessage = "Bonjour,\n\nCeci est un e-mail de test pour vérifier la délivrabilité automatique des codes OTP et des notifications sur ZUBIKS SERVICE.\n\nCode de test : " . rand(100000, 999999) . "\n\nCordialement,\nZubiks Service";

echo "<!DOCTYPE html><html lang='fr'><head><meta charset='UTF-8'><title>Test Mail - Zubiks</title>";
echo "<style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;padding:40px;line-height:1.6;}.card{background:#1e293b;padding:30px;border-radius:12px;max-width:600px;margin:0 auto;border:1px solid #334155;}h2{color:#38bdf8;}.code{background:#090d16;padding:15px;border-radius:8px;font-family:monospace;color:#a7f3d0;word-break:break-all;}</style></head><body>";
echo "<div class='card'><h2>📧 Diagnostic d'envoi d'e-mail ZUBIKS (EmailJS)</h2>";
echo "<p>Tentative d'envoi vers : <b>" . htmlspecialchars($testEmail) . "</b></p>";

global $EMAILJS_SERVICE_ID, $EMAILJS_TEMPLATE_ID, $EMAILJS_PUBLIC_KEY, $EMAILJS_PRIVATE_KEY;
if (empty($EMAILJS_SERVICE_ID) || $EMAILJS_SERVICE_ID === 'YOUR_SERVICE_ID') {
    echo "<p style='color:#f87171;'>⚠️ Les clés EmailJS ne sont pas configurées dans api/db.php.</p>";
} else {
    echo "<p style='color:#34d399;'>✅ Configuration EmailJS présente dans api/db.php (Service ID: " . htmlspecialchars($EMAILJS_SERVICE_ID) . ")</p>";
}

// Essai avec l'expéditeur EmailJS
$success = false;

echo "<h3>Essai d'envoi via l'API REST EmailJS</h3>";
$payload = json_encode([
    "service_id" => $EMAILJS_SERVICE_ID,
    "template_id" => $EMAILJS_TEMPLATE_ID,
    "user_id" => $EMAILJS_PUBLIC_KEY,
    "accessToken" => $EMAILJS_PRIVATE_KEY,
    "template_params" => [
        "to_email" => $testEmail,
        "subject" => $testSubject,
        "message" => $testMessage,
        "reply_to" => "zubiksservice@gmail.com"
    ]
], JSON_UNESCAPED_UNICODE);

$ch = curl_init("https://api.emailjs.com/api/v1.0/email/send");
curl_setopt($ch, CURLOPT_HTTPHEADER, [
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
echo "<b>Réponse EmailJS :</b> " . htmlspecialchars($response);
echo "</div>";

if ($httpCode >= 200 && $httpCode < 300) {
    echo "<h3 style='color:#34d399;'>🎉 SUCCÈS ! L'e-mail a été accepté par EmailJS. Consultez la boîte de réception ou les Spams de $testEmail.</h3>";
    $success = true;
}

if (!$success) {
    echo "<h3 style='color:#f87171;'>❌ Échec de l'envoi. Vérifiez vos clés et variables sur le dashboard EmailJS.</h3>";
}

echo "<br><a href='../public/' style='color:#38bdf8;'>← Retour à l'application</a></div></body></html>";

