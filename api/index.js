const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const emailService = require('./email');
const { getFullState, saveFullState, isPostgresConnected, addAuditLog } = require('../db/index.js');

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'ZUBIX_SERVICE_SECURE_JWT_SECRET_2026_KEY';

// In-memory anti-double submission lock map (cooldown per member/amount key)
const submissionLocks = new Map();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Determine database path safely for Vercel Serverless (/tmp) or Local
const DB_FILE = process.env.VERCEL
  ? path.join('/tmp', 'database.json')
  : path.join(__dirname, '..', 'database.json');

// Default state template with hashed admin password fallback
const DEFAULT_STATE = {
  members: [],
  dailyDepots: 0,
  dailyRetraits: 0,
  cycleDepots: 0,
  cycleRetraits: 0,
  argentDebut: 0,
  reglements: "",
  archives: [],
  dailyArchives: [],
  transactions: [],
  deletedMembers: [],
  messages: [],
  credentials: {
    email: "zubiksservice@gmail.com",
    passwordHash: bcrypt.hashSync("Zubiks@2000", 10)
  }
};

let memoryState = null;

function loadStateFromDisk() {
  if (memoryState) return memoryState;

  if (fs.existsSync(DB_FILE)) {
    try {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(data);
      
      // Ensure admin passwordHash exists
      if (parsed.credentials && !parsed.credentials.passwordHash && parsed.credentials.password) {
        parsed.credentials.passwordHash = bcrypt.hashSync(parsed.credentials.password, 10);
        delete parsed.credentials.password;
      }
      
      // Auto-migrate stale admin email on server database load
      if (parsed.credentials && parsed.credentials.email && parsed.credentials.email.trim().toLowerCase() === 'obedtechn02@gmail.com') {
        parsed.credentials.email = 'zubiksservice@gmail.com';
        try {
          fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf8');
        } catch (writeErr) {
          console.error("Erreur d'écriture lors de la migration de l'email admin :", writeErr);
        }
      }

      // Auto-migrate any unhashed member passwords and normalize emails
      if (Array.isArray(parsed.members)) {
        let migrationNeeded = false;
        parsed.members.forEach(m => {
          if (!m.passwordHash && m.password) {
            m.passwordHash = bcrypt.hashSync(m.password, 10);
            delete m.password;
            migrationNeeded = true;
          }
          if (m.email) {
            m.email = m.email.trim().toLowerCase();
          }
        });
        if (migrationNeeded) {
          try {
            fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf8');
          } catch (writeErr) {
            console.error("Erreur d'écriture lors de la migration des mots de passe membres :", writeErr);
          }
        }
      }
      
      memoryState = parsed;
      return memoryState;
    } catch (err) {
      console.error("Erreur de lecture du fichier de base de données :", err);
    }
  }

  memoryState = JSON.parse(JSON.stringify(DEFAULT_STATE));
  return memoryState;
}

function saveStateToDisk(newState) {
  memoryState = JSON.parse(JSON.stringify(newState));
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(newState, null, 2), 'utf8');
  } catch (err) {
    console.error("Erreur d'écriture dans la base de données :", err);
  }
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Accès non autorisé. Jeton JWT manquant." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Jeton invalide ou expiré." });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: "Accès refusé. Privilèges Administrateur requis." });
  }
  next();
}

// Helper to sanitize state (strip password hashes before sending to client)
function sanitizeState(state) {
  const copy = JSON.parse(JSON.stringify(state));
  if (copy.credentials) {
    delete copy.credentials.password;
    delete copy.credentials.passwordHash;
  }
  if (Array.isArray(copy.members)) {
    copy.members.forEach(m => {
      delete m.password;
      delete m.passwordHash;
    });
  }
  return copy;
}

// API: Database Connection Status
app.get('/api/db-status', (req, res) => {
  res.json({
    connected: isPostgresConnected(),
    engine: isPostgresConnected() ? 'PostgreSQL Cloud (Supabase/Neon)' : 'Stockage Local Fallback',
    timestamp: new Date().toISOString()
  });
});

// API: Auth Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Veuillez fournir un email et un mot de passe." });
  }

  const lowerEmail = email.trim().toLowerCase();
  const state = await getFullState();

  // 1. Check Admin Credentials
  const adminEmail = (state.credentials && state.credentials.email) ? state.credentials.email.trim().toLowerCase() : "zubiksservice@gmail.com";
  let isAdminMatch = false;

  if (lowerEmail === adminEmail) {
    if (state.credentials.passwordHash) {
      isAdminMatch = bcrypt.compareSync(password, state.credentials.passwordHash);
    } else if (state.credentials.password) {
      isAdminMatch = (password === state.credentials.password);
      state.credentials.passwordHash = bcrypt.hashSync(password, 10);
      delete state.credentials.password;
      await saveFullState(state);
    } else {
      isAdminMatch = (password === "Zubiks@2000");
    }

    if (isAdminMatch) {
      const userPayload = {
        id: 'admin-001',
        role: 'admin',
        nom: 'Admin ZUBIKS',
        email: adminEmail
      };
      const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });
      await addAuditLog({
        userId: userPayload.id,
        userName: userPayload.nom,
        action: 'CONNEXION_ADMIN',
        details: `Connexion administrateur réussie pour ${adminEmail}`
      });
      return res.json({ success: true, token, user: userPayload });
    } else {
      return res.status(401).json({ error: "Email ou mot de passe incorrect." });
    }
  }

  // 2. Check if account was soft deleted
  const isDeleted = (state.deletedMembers || []).some(d => (d.email || '').trim().toLowerCase() === lowerEmail);
  if (isDeleted) {
    return res.status(403).json({ error: "Votre compte a été supprimé." });
  }

  // 3. Check Member User Credentials
  const member = (state.members || []).find(m => (m.email || '').trim().toLowerCase() === lowerEmail);
  if (member) {
    let isMemberMatch = false;
    if (member.passwordHash) {
      isMemberMatch = bcrypt.compareSync(password, member.passwordHash);
    } else if (member.password) {
      isMemberMatch = (password === member.password);
      member.passwordHash = bcrypt.hashSync(password, 10);
      delete member.password;
      await saveFullState(state);
    }

    if (isMemberMatch) {
      const userPayload = {
        id: member.id,
        role: 'user',
        nom: member.nom,
        email: member.email,
        status: member.status
      };
      const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });
      await addAuditLog({
        userId: userPayload.id,
        userName: userPayload.nom,
        action: 'CONNEXION_UTILISATEUR',
        details: `Connexion utilisateur réussie pour ${member.email}`
      });
      const sanitizedMember = JSON.parse(JSON.stringify(member));
      delete sanitizedMember.password;
      delete sanitizedMember.passwordHash;
      return res.json({ success: true, token, user: sanitizedMember });
    }
  }

  return res.status(401).json({ error: "Email ou mot de passe incorrect." });
});

// API: Auth Register
app.post('/api/auth/register', async (req, res) => {
  const { nom, postnom, sexe, email, password } = req.body || {};
  if (!nom || !email || !password) {
    return res.status(400).json({ error: "Champs obligatoires manquants." });
  }

  const lowerEmail = email.trim().toLowerCase();
  const state = await getFullState();

  const existing = (state.members || []).find(m => (m.email || '').trim().toLowerCase() === lowerEmail);
  const adminEmail = (state.credentials && state.credentials.email) ? state.credentials.email.trim().toLowerCase() : "zubiksservice@gmail.com";

  if (existing || lowerEmail === adminEmail) {
    return res.status(400).json({ error: "Cette adresse email est déjà enregistrée." });
  }

  const fullName = `${nom} ${postnom || ''}`.trim();
  const passwordHash = bcrypt.hashSync(password, 10);

  const newMemberId = Date.now().toString();
  const newMember = {
    id: newMemberId,
    nom: fullName,
    postnom: postnom || '',
    sexe: sexe || 'Homme',
    email: lowerEmail,
    passwordHash: passwordHash,
    role: 'user',
    status: 'pending',
    parts: 0,
    totalDepot: 0,
    totalRetrait: 0,
    dateAjout: new Date().toISOString()
  };

  // Remove email from deletedMembers if re-registering
  if (state.deletedMembers) {
    state.deletedMembers = state.deletedMembers.filter(d => (d.email || '').trim().toLowerCase() !== lowerEmail);
  }

  if (!state.members) state.members = [];
  state.members.push(newMember);
  await saveFullState(state);

  await addAuditLog({
    userId: newMemberId,
    userName: fullName,
    action: 'INSCRIPTION_UTILISATEUR',
    details: `Nouveau compte créé pour ${fullName} (${lowerEmail})`
  });

  // Trigger welcome email asynchronously
  emailService.sendWelcomeEmail(lowerEmail, fullName).catch(err => {
    console.error("Erreur lors de l'envoi de l'email de bienvenue :", err);
  });

  res.json({ success: true, message: "Inscription réussie." });
});

// API: Auth Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: "Veuillez fournir une adresse email." });
  }

  const lowerEmail = email.trim().toLowerCase();
  const state = await getFullState();

  const adminEmail = (state.credentials && state.credentials.email) ? state.credentials.email.trim().toLowerCase() : "zubiksservice@gmail.com";
  const member = (state.members || []).find(m => (m.email || '').trim().toLowerCase() === lowerEmail);

  let targetName = '';
  if (lowerEmail === adminEmail) {
    targetName = 'Administrateur ZUBIKS';
  } else if (member) {
    targetName = member.nom;
  } else {
    return res.status(404).json({ error: "Aucun compte n'est associé à cette adresse email." });
  }

  // Generate secure random reset token
  const resetToken = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 3600000; // 1 hour

  if (!state.resetTokens) state.resetTokens = [];
  state.resetTokens = state.resetTokens.filter(t => (t.email || '').trim().toLowerCase() !== lowerEmail);

  state.resetTokens.push({
    token: resetToken,
    email: lowerEmail,
    expiresAt: expiresAt
  });

  await saveFullState(state);

  const protocol = req.protocol || 'http';
  const host = req.headers.host || 'localhost:3000';
  const hostUrl = `${protocol}://${host}`;

  emailService.sendResetPasswordEmail(lowerEmail, targetName, resetToken, hostUrl).catch(err => {
    console.error("Erreur d'envoi d'e-mail de réinitialisation :", err);
  });

  res.json({
    success: true,
    message: "Un e-mail contenant le lien de réinitialisation a été envoyé.",
    resetToken: resetToken
  });
});

// API: Auth Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: "Le jeton et le nouveau mot de passe sont obligatoires." });
  }

  const state = await getFullState();
  const cleanToken = token.trim();

  const tokenIndex = (state.resetTokens || []).findIndex(t => t.token === cleanToken);
  if (tokenIndex === -1) {
    return res.status(400).json({ error: "Jeton de réinitialisation invalide." });
  }

  const tokenEntry = state.resetTokens[tokenIndex];
  if (Date.now() > tokenEntry.expiresAt) {
    state.resetTokens.splice(tokenIndex, 1);
    await saveFullState(state);
    return res.status(400).json({ error: "Le jeton de réinitialisation a expiré. Veuillez refaire une demande." });
  }

  const targetEmail = tokenEntry.email.trim().toLowerCase();
  const adminEmail = (state.credentials && state.credentials.email) ? state.credentials.email.trim().toLowerCase() : "zubiksservice@gmail.com";
  const newHash = bcrypt.hashSync(newPassword, 10);

  let updated = false;

  if (targetEmail === adminEmail) {
    if (!state.credentials) state.credentials = {};
    state.credentials.passwordHash = newHash;
    delete state.credentials.password;
    updated = true;
  }

  const member = (state.members || []).find(m => (m.email || '').trim().toLowerCase() === targetEmail);
  if (member) {
    member.passwordHash = newHash;
    delete member.password;
    updated = true;
  }

  if (!updated) {
    return res.status(404).json({ error: "Compte introuvable pour cet e-mail." });
  }

  // Remove used token
  state.resetTokens.splice(tokenIndex, 1);
  await saveFullState(state);

  res.json({ success: true, message: "Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter." });
});

// API: Change Admin Credentials
app.post('/api/auth/credentials', authenticateToken, requireAdmin, async (req, res) => {
  const { newEmail, newPassword } = req.body || {};
  if (!newEmail || !newPassword) {
    return res.status(400).json({ error: "Veuillez fournir le nouvel email et mot de passe." });
  }

  const state = await getFullState();
  const lowerNewEmail = newEmail.trim().toLowerCase();

  const existingMember = (state.members || []).find(m => (m.email || '').trim().toLowerCase() === lowerNewEmail);
  if (existingMember) {
    return res.status(400).json({ error: "Cette adresse email est déjà utilisée par un membre." });
  }

  if (!state.credentials) state.credentials = {};
  state.credentials.email = lowerNewEmail;
  state.credentials.passwordHash = bcrypt.hashSync(newPassword, 10);

  await saveFullState(state, req.user);

  await addAuditLog({
    userId: req.user.id,
    userName: req.user.nom,
    action: 'MODIFICATION_IDENTIFIANTS_ADMIN',
    details: `Nouvel email admin défini : ${lowerNewEmail}`
  });

  res.json({ success: true, message: "Identifiants de l'administrateur mis à jour en base de données." });
});

// API: Get State
app.get('/api/state', async (req, res) => {
  try {
    const currentState = await getFullState();
    res.json(sanitizeState(currentState));
  } catch (err) {
    console.error("Erreur GET /api/state :", err);
    res.status(500).json({ error: "Erreur lors de la récupération des données." });
  }
});

// API: Save State (Protected for Authenticated Users / Admins)
app.post('/api/state', authenticateToken, async (req, res) => {
  const newState = req.body;
  if (!newState) {
    return res.status(400).json({ error: "Aucune donnée fournie." });
  }

  if (newState.members === undefined || newState.transactions === undefined) {
    return res.status(400).json({ error: "Format de données invalide." });
  }

  try {
    const existingState = await getFullState();
    
    // Preserve sensitive admin credentials
    if (existingState.credentials) {
      newState.credentials = existingState.credentials;
    }

    if (Array.isArray(newState.members)) {
      newState.members.forEach(m => {
        const orig = (existingState.members || []).find(o => 
          String(o.id) === String(m.id) || 
          (o.email && m.email && o.email.trim().toLowerCase() === m.email.trim().toLowerCase())
        );
        if (orig) {
          if (orig.passwordHash) m.passwordHash = orig.passwordHash;
          if (orig.password) m.password = orig.password;
        }

        if (!m.passwordHash && m.password) {
          m.passwordHash = bcrypt.hashSync(m.password, 10);
          delete m.password;
        }

        if (m.email) {
          m.email = m.email.trim().toLowerCase();
        }
      });
    }

    const saved = await saveFullState(newState, req.user);
    if (!saved) {
      return res.status(500).json({ error: "Erreur lors de l'enregistrement en base de données." });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Erreur POST /api/state :", err);
    res.status(500).json({ error: "Erreur serveur lors de la sauvegarde." });
  }
});

// API REST: Members List
app.get('/api/members', async (req, res) => {
  try {
    const state = await getFullState();
    res.json(state.members || []);
  } catch (err) {
    res.status(500).json({ error: "Erreur lors de la récupération des membres." });
  }
});

// API REST: Direct Member Creation (Admin only)
app.post('/api/members', authenticateToken, requireAdmin, async (req, res) => {
  const { nom, postnom, sexe, parts, email, telephone } = req.body || {};
  if (!nom || nom.trim() === '') return res.status(400).json({ error: "Le nom du membre est obligatoire." });

  try {
    const state = await getFullState();
    const newMember = {
      id: Date.now().toString(),
      nom: nom.trim(),
      postnom: postnom ? postnom.trim() : '',
      sexe: sexe || 'Homme',
      parts: Math.max(0, parseInt(parts || 0, 10)),
      totalDepot: 0,
      totalRetrait: 0,
      email: email ? email.trim().toLowerCase() : null,
      telephone: telephone || null,
      status: 'active',
      dateAjout: new Date().toISOString()
    };

    state.members.push(newMember);
    await saveFullState(state, req.user);

    await addAuditLog({
      userId: req.user.id,
      userName: req.user.nom,
      action: 'CREATION_MEMBRE',
      tableName: 'members',
      recordId: newMember.id,
      newVal: newMember,
      details: `Création du membre ${newMember.nom} avec ${newMember.parts} parts`
    });

    res.json({ success: true, member: newMember });
  } catch (err) {
    res.status(500).json({ error: "Erreur lors de la création du membre." });
  }
});

// API REST: Add Transaction (Dépôt / Retrait) with Anti-Double Submission Lock
app.post('/api/transactions', authenticateToken, async (req, res) => {
  const { memberId, type, montant, modePaiement, reference } = req.body || {};
  const numAmount = parseFloat(montant);

  if (!memberId || !type || !['depot', 'retrait'].includes(type) || !Number.isFinite(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: "Montant ou type de transaction invalide." });
  }

  // Anti-double submission lock (key: memberId + type + montant + 3-second window)
  const lockKey = `${req.user.id || req.user.email}_${memberId}_${type}_${numAmount}`;
  const now = Date.now();
  if (submissionLocks.has(lockKey) && (now - submissionLocks.get(lockKey)) < 3000) {
    return res.status(429).json({ error: "Transaction déjà en cours de traitement. Veuillez patienter 3 secondes." });
  }
  submissionLocks.set(lockKey, now);

  try {
    const state = await getFullState();
    const member = state.members.find(m => String(m.id) === String(memberId));
    if (!member) return res.status(404).json({ error: "Membre non trouvé." });

    const newTx = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
      memberId: String(memberId),
      memberName: member.nom,
      type,
      montant: numAmount,
      parts: member.parts || 0,
      date: new Date().toISOString(),
      modePaiement: modePaiement || 'cash',
      reference: reference || null
    };

    if (type === 'depot') {
      member.totalDepot = (parseFloat(member.totalDepot) || 0) + numAmount;
      state.dailyDepots = (parseFloat(state.dailyDepots) || 0) + numAmount;
      state.cycleDepots = (parseFloat(state.cycleDepots) || 0) + numAmount;
    } else if (type === 'retrait') {
      member.totalRetrait = (parseFloat(member.totalRetrait) || 0) + numAmount;
      state.dailyRetraits = (parseFloat(state.dailyRetraits) || 0) + numAmount;
      state.cycleRetraits = (parseFloat(state.cycleRetraits) || 0) + numAmount;
    }

    state.transactions.unshift(newTx);
    await saveFullState(state, req.user);

    await addAuditLog({
      userId: req.user.id,
      userName: req.user.nom,
      action: type.toUpperCase(),
      tableName: 'transactions',
      recordId: newTx.id,
      newVal: newTx,
      details: `${type.toUpperCase()} de ${numAmount} $ pour le membre ${member.nom}`
    });

    res.json({ success: true, transaction: newTx, member });
  } catch (err) {
    console.error("Erreur transaction :", err);
    res.status(500).json({ error: "Erreur lors de l'enregistrement de la transaction." });
  } finally {
    setTimeout(() => submissionLocks.delete(lockKey), 3000);
  }
});

// API REST: Admin Backup Export
app.get('/api/admin/backup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const state = await getFullState();
    const backupData = sanitizeState(state);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=zubiks_backup_${new Date().toISOString().split('T')[0]}.json`);
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err) {
    res.status(500).json({ error: "Erreur lors de la génération de la sauvegarde." });
  }
});

// Export app instance for Vercel Serverless Functions
module.exports = app;

// Direct local execution helper
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Serveur API ZUBIKS à l'écoute sur http://localhost:${PORT}`);
  });
}
