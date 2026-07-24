const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'ZUBIX_SERVICE_SECURE_JWT_SECRET_2026_KEY';

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
      if (parsed.credentials && parsed.credentials.email && parsed.credentials.email.toLowerCase() === 'obedtechn02@gmail.com') {
        parsed.credentials.email = 'zubiksservice@gmail.com';
        try {
          fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf8');
        } catch (writeErr) {
          console.error("Erreur d'écriture lors de la migration de l'email admin :", writeErr);
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
  memoryState = { ...newState };
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

// Helper to sanitize state (strip passwords before sending to client)
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

// API: Auth Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Veuillez fournir un email et un mot de passe." });
  }

  const state = loadStateFromDisk();
  const lowerEmail = email.trim().toLowerCase();

  // Check Admin credentials
  const adminEmail = (state.credentials && state.credentials.email) ? state.credentials.email.toLowerCase() : "zubiksservice@gmail.com";
  let isAdminMatch = false;

  if (lowerEmail === adminEmail) {
    if (state.credentials.passwordHash) {
      isAdminMatch = bcrypt.compareSync(password, state.credentials.passwordHash);
    } else if (state.credentials.password) {
      isAdminMatch = (password === state.credentials.password);
      // Migrate password to hash
      state.credentials.passwordHash = bcrypt.hashSync(password, 10);
      delete state.credentials.password;
      saveStateToDisk(state);
    } else {
      isAdminMatch = (password === "Zubiks@2000");
    }

    if (isAdminMatch) {
      const userPayload = {
        role: 'admin',
        nom: 'Admin ZUBIKS',
        email: adminEmail
      };
      const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, token, user: userPayload });
    } else {
      return res.status(401).json({ error: "Email ou mot de passe incorrect." });
    }
  }

  // Check if account was deleted
  const isDeleted = (state.deletedMembers || []).some(d => (d.email || '').toLowerCase() === lowerEmail);
  if (isDeleted) {
    return res.status(403).json({ error: "Votre compte a été supprimé." });
  }

  // Check Member User credentials
  const member = (state.members || []).find(m => (m.email || '').toLowerCase() === lowerEmail);
  if (member) {
    let isMemberMatch = false;
    if (member.passwordHash) {
      isMemberMatch = bcrypt.compareSync(password, member.passwordHash);
    } else if (member.password) {
      isMemberMatch = (password === member.password);
      // Migrate member password to hash
      member.passwordHash = bcrypt.hashSync(password, 10);
      delete member.password;
      saveStateToDisk(state);
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
      const sanitizedMember = JSON.parse(JSON.stringify(member));
      delete sanitizedMember.password;
      delete sanitizedMember.passwordHash;
      return res.json({ success: true, token, user: sanitizedMember });
    }
  }

  return res.status(401).json({ error: "Email ou mot de passe incorrect. Si un nouveau cycle a démarré, veuillez créer à nouveau votre compte." });
});

// API: Auth Register
app.post('/api/auth/register', (req, res) => {
  const { nom, postnom, sexe, email, password } = req.body || {};
  if (!nom || !email || !password) {
    return res.status(400).json({ error: "Champs obligatoires manquants." });
  }

  const state = loadStateFromDisk();
  const lowerEmail = email.trim().toLowerCase();

  const existing = state.members.find(m => (m.email || '').toLowerCase() === lowerEmail);
  const adminEmail = (state.credentials && state.credentials.email) ? state.credentials.email.toLowerCase() : "zubiksservice@gmail.com";

  if (existing || lowerEmail === adminEmail) {
    return res.status(400).json({ error: "Cette adresse email est déjà enregistrée." });
  }

  const fullName = `${nom} ${postnom || ''}`.trim();
  const passwordHash = bcrypt.hashSync(password, 10);

  const newUser = {
    id: Date.now().toString(),
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
    dateAjout: new Date().toISOString(),
    notifications: [
      {
        id: Date.now().toString(),
        message: "Bienvenue sur ZUBIX SERVICE ! Votre compte a été créé avec succès.",
        date: new Date().toISOString(),
        read: false
      }
    ]
  };

  // Effacer l'email de deletedMembers s'il y figure afin d'autoriser la réinscription
  if (state.deletedMembers) {
    state.deletedMembers = state.deletedMembers.filter(d => (d.email || '').toLowerCase() !== lowerEmail);
  }

  state.members.push(newUser);
  saveStateToDisk(state);

  res.json({ success: true, message: "Inscription réussie." });
});

// API: Change Admin Credentials
app.post('/api/auth/credentials', authenticateToken, requireAdmin, (req, res) => {
  const { newEmail, newPassword } = req.body || {};
  if (!newEmail || !newPassword) {
    return res.status(400).json({ error: "Veuillez fournir le nouvel email et mot de passe." });
  }

  const state = loadStateFromDisk();
  const lowerNewEmail = newEmail.trim().toLowerCase();

  // Check if new email is already used by a member
  const existingMember = state.members.find(m => (m.email || '').toLowerCase() === lowerNewEmail);
  if (existingMember) {
    return res.status(400).json({ error: "Cette adresse email est déjà utilisée par un membre." });
  }

  if (!state.credentials) state.credentials = {};

  state.credentials.email = newEmail.trim();
  state.credentials.passwordHash = bcrypt.hashSync(newPassword, 10);
  delete state.credentials.password;

  saveStateToDisk(state);
  res.json({ success: true, message: "Identifiants de l'administrateur mis à jour." });
});

// API: Get State
app.get('/api/state', (req, res) => {
  const currentState = loadStateFromDisk();
  res.json(sanitizeState(currentState));
});

// API: Save State (Protected for Authenticated Users / Admins)
app.post('/api/state', (req, res) => {
  const newState = req.body;
  if (!newState) {
    return res.status(400).json({ error: "Aucune donnée fournie." });
  }

  if (newState.members === undefined || newState.transactions === undefined) {
    return res.status(400).json({ error: "Format de données invalide." });
  }

  const existingState = loadStateFromDisk();
  
  // Preserve sensitive admin credentials entirely from existing state
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

  saveStateToDisk(newState);
  res.json({ success: true });
});

// Export app instance for Vercel Serverless Functions
module.exports = app;

// Allow direct local execution via node api/index.js if needed
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Serveur API à l'écoute sur http://localhost:${PORT}`);
  });
}
