<?php
// api/reset_admin.php - Script de réinitialisation d'urgence du mot de passe administrateur
require_once 'db.php';

header('Content-Type: text/html; charset=utf-8');

try {
    $stmt = $pdo->prepare("UPDATE global_stats SET admin_password = NULL WHERE id = 1");
    $stmt->execute();
    
    echo "<!DOCTYPE html>
    <html lang='fr'>
    <head>
        <meta charset='UTF-8'>
        <title>Réinitialisation Admin - Zubiks Service</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
            .card { background: #1e293b; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; max-width: 500px; border: 1px solid #334155; }
            h2 { color: #10b981; margin-bottom: 10px; font-size: 1.8rem; }
            p { color: #cbd5e1; line-height: 1.6; font-size: 1rem; margin-bottom: 20px; }
            .highlight { color: #38bdf8; font-weight: bold; }
            .btn { display: inline-block; background: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: bold; transition: background 0.3s; }
            .btn:hover { background: #4338ca; }
        </style>
    </head>
    <body>
        <div class='card'>
            <h2>✅ Réinitialisation réussie !</h2>
            <p>Le mot de passe administrateur pour <span class='highlight'>zubiksservice@gmail.com</span> a été remis à zéro avec succès.</p>
            <p>Vous pouvez maintenant retourner sur la page de connexion et saisir <b>le mot de passe de votre choix</b>. Ce mot de passe sera automatiquement enregistré comme votre nouveau mot de passe administrateur.</p>
            <a href='../public/' class='btn'>🔑 Accéder à la connexion</a>
        </div>
    </body>
    </html>";
} catch (Exception $e) {
    echo "<h2 style='color:red;'>Erreur : " . htmlspecialchars($e->getMessage()) . "</h2>";
}
