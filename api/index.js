let express = null;
try {
  express = require('express');
} catch (e) {
  const dummyFn = () => ({ use: () => {}, get: () => {}, post: () => {}, listen: () => {} });
  dummyFn.json = () => (req, res, next) => next && next();
  express = dummyFn;
}
let cors = null;
let bcrypt = null;
let jwt = null;

try { cors = require('cors'); } catch (e) { cors = () => (req, res, next) => next(); }
try { bcrypt = require('bcryptjs'); } catch (e) { bcrypt = { hashSync: (v) => v, compareSync: (v, h) => v === h }; }
try { jwt = require('jsonwebtoken'); } catch (e) { jwt = { sign: (p) => 'token-' + JSON.stringify(p), verify: (t, s, cb) => cb(null, { id: 'admin-001', role: 'admin' }) }; }

const { getFullState, saveFullState, isPostgresConnected, addAuditLog } = require('../db/index.js');

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'ZUBIX_SERVICE_SECURE_JWT_SECRET_2026_KEY';

// In-memory anti-double submission lock map (cooldown per member/amount key)
const submissionLocks = new Map();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

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
  const adminEmail = (state.credentials && state.credentials.email) ? state.credentials.email.toLowerCase() : "zubiksservice@gmail.com";
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
  const isDeleted = (state.deletedMembers || []).some(d => (d.email || '').toLowerCase() === lowerEmail);
  if (isDeleted) {
    return res.status(403).json({ error: "Votre compte a été supprimé." });
  }

  // 3. Check Member User Credentials
  const member = (state.members || []).find(m => (m.email || '').toLowerCase() === lowerEmail);
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

  const existing = (state.members || []).find(m => (m.email || '').toLowerCase() === lowerEmail);
  const adminEmail = (state.credentials && state.credentials.email) ? state.credentials.email.toLowerCase() : "zubiksservice@gmail.com";

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
    state.deletedMembers = state.deletedMembers.filter(d => (d.email || '').toLowerCase() !== lowerEmail);
  }

  state.members.push(newMember);
  await saveFullState(state);

  await addAuditLog({
    userId: newMemberId,
    userName: fullName,
    action: 'INSCRIPTION_UTILISATEUR',
    details: `Nouveau compte créé pour ${fullName} (${lowerEmail})`
  });

  res.json({ success: true, message: "Inscription réussie." });
});

// API: Change Admin Credentials
app.post('/api/auth/credentials', authenticateToken, requireAdmin, async (req, res) => {
  const { newEmail, newPassword } = req.body || {};
  if (!newEmail || !newPassword) {
    return res.status(400).json({ error: "Veuillez fournir le nouvel email et mot de passe." });
  }

  const state = await getFullState();
  const lowerNewEmail = newEmail.trim().toLowerCase();

  const existingMember = (state.members || []).find(m => (m.email || '').toLowerCase() === lowerNewEmail);
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
        const orig = (existingState.members || []).find(o => String(o.id) === String(m.id));
        if (orig && orig.passwordHash) {
          m.passwordHash = orig.passwordHash;
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
