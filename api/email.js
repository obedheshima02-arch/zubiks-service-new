const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'ZUBIX SERVICE <noreply@zubiksservice.com>';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
});

/**
 * Envoie un e-mail de bienvenue à l'utilisateur nouvellement inscrit.
 */
async function sendWelcomeEmail(userEmail, userName) {
  const subject = "Bienvenue sur ZUBIX SERVICE – Inscription réussie !";
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="fr">
  <head>
    <meta charset="UTF-8">
    <style>
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
      .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid #334155; }
      .header { background: linear-gradient(135deg, #1e3a8a, #0f766e); padding: 30px; text-align: center; }
      .header h1 { margin: 0; font-size: 1.8rem; color: #ffffff; letter-spacing: 1px; }
      .header span { color: #38bdf8; }
      .body { padding: 30px; line-height: 1.6; color: #e2e8f0; }
      .badge { display: inline-block; background: #0284c7; color: #ffffff; padding: 6px 14px; border-radius: 20px; font-weight: bold; font-size: 0.85rem; margin-bottom: 15px; }
      .footer { background: #0f172a; padding: 20px; text-align: center; font-size: 0.8rem; color: #64748b; border-top: 1px solid #334155; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>ZUBIX <span>SERVICE</span></h1>
      </div>
      <div class="body">
        <div class="badge">Bienvenue</div>
        <h2>Bonjour ${userName},</h2>
        <p>Votre compte utilisateur sur la plateforme <strong>ZUBIX SERVICE – Ristournes</strong> a été créé avec succès.</p>
        <p>Votre compte est actuellement en attente de la validation de vos parts par l'administrateur. Une fois vos parts validées, vous pourrez accéder à l'intégralité de vos services et suivre vos cotisations et tontines en temps réel.</p>
        <p>Si vous avez des questions, n'hésitez pas à contacter le support administrateur depuis votre espace membre.</p>
        <p style="margin-top: 25px;">Cordialement,<br><strong>L'équipe ZUBIX SERVICE</strong></p>
      </div>
      <div class="footer">
        © 2026 ZUBIX SERVICE. Tous droits réservés.
      </div>
    </div>
  </body>
  </html>
  `;

  try {
    const result = await transporter.sendMail({
      from: SMTP_FROM,
      to: userEmail,
      subject: subject,
      html: htmlContent
    });
    console.log(`[EMAIL WELCOME] E-mail de bienvenue envoyé à : ${userEmail}`);
    return result;
  } catch (err) {
    console.error(`[EMAIL WELCOME ERROR] Erreur d'envoi d'e-mail à ${userEmail} :`, err);
  }
}

/**
 * Envoie un e-mail de réinitialisation de mot de passe avec un jeton sécurisé temporaire.
 */
async function sendResetPasswordEmail(userEmail, userName, resetToken, hostUrl = '') {
  const baseUrl = hostUrl || 'http://localhost:3000';
  const resetLink = `${baseUrl}/?resetToken=${resetToken}`;
  const subject = "Réinitialisation de votre mot de passe – ZUBIX SERVICE";

  const htmlContent = `
  <!DOCTYPE html>
  <html lang="fr">
  <head>
    <meta charset="UTF-8">
    <style>
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
      .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid #334155; }
      .header { background: linear-gradient(135deg, #1e3a8a, #d97706); padding: 30px; text-align: center; }
      .header h1 { margin: 0; font-size: 1.8rem; color: #ffffff; letter-spacing: 1px; }
      .header span { color: #f59e0b; }
      .body { padding: 30px; line-height: 1.6; color: #e2e8f0; }
      .btn { display: inline-block; background: linear-gradient(135deg, #d97706, #b45309); color: #ffffff !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 20px 0; box-shadow: 0 4px 12px rgba(217, 119, 6, 0.4); }
      .token-box { background: #0f172a; border: 1px dashed #d97706; padding: 12px; font-family: monospace; font-size: 1.1rem; color: #f59e0b; word-break: break-all; border-radius: 6px; text-align: center; margin: 15px 0; }
      .warning { font-size: 0.85rem; color: #94a3b8; background: #334155; padding: 12px; border-radius: 6px; border-left: 4px solid #f59e0b; }
      .footer { background: #0f172a; padding: 20px; text-align: center; font-size: 0.8rem; color: #64748b; border-top: 1px solid #334155; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>ZUBIX <span>SERVICE</span></h1>
      </div>
      <div class="body">
        <h2>Bonjour ${userName},</h2>
        <p>Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte <strong>ZUBIX SERVICE</strong>.</p>
        <p>Veuillez cliquer sur le bouton ci-dessous pour choisir votre nouveau mot de passe :</p>
        <div style="text-align: center;">
          <a href="${resetLink}" class="btn">Réinitialiser mon mot de passe</a>
        </div>
        <p>Si le bouton ne fonctionne pas, vous pouvez copier et coller le lien ci-dessous dans votre navigateur :</p>
        <div class="token-box">${resetLink}</div>
        <div class="warning">
          <strong>⚠️ Sécurité :</strong> Ce lien est à usage unique et expirera automatiquement dans <strong>1 heure</strong>. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.
        </div>
        <p style="margin-top: 25px;">Cordialement,<br><strong>L'équipe ZUBIX SERVICE</strong></p>
      </div>
      <div class="footer">
        © 2026 ZUBIX SERVICE. Tous droits réservés.
      </div>
    </div>
  </body>
  </html>
  `;

  try {
    const result = await transporter.sendMail({
      from: SMTP_FROM,
      to: userEmail,
      subject: subject,
      html: htmlContent
    });
    console.log(`[EMAIL RESET] E-mail de réinitialisation envoyé à : ${userEmail}`);
    return result;
  } catch (err) {
    console.error(`[EMAIL RESET ERROR] Erreur d'envoi d'e-mail de réinitialisation à ${userEmail} :`, err);
  }
}

module.exports = {
  sendWelcomeEmail,
  sendResetPasswordEmail
};
