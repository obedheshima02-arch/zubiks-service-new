const fs = require('fs');
const path = require('path');

let Pool = null;
try {
  Pool = require('pg').Pool;
} catch (e) {
  // Le module 'pg' sera installé lors du npm install local ou sur Vercel
}
let bcrypt = null;
try {
  bcrypt = require('bcryptjs');
} catch (e) {
  bcrypt = {
    hashSync: (val) => val,
    compareSync: (val, hash) => val === hash
  };
}

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let pool = null;
let isPostgresAvailable = false;

// Fallback JSON file path when DATABASE_URL is not set locally
const FALLBACK_DB_FILE = process.env.VERCEL
  ? path.join('/tmp', 'database.json')
  : path.join(__dirname, '..', 'database.json');

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

// Reuse PostgreSQL Connection Pool across serverless warm invocations (Vercel optimization)
if (dbUrl && Pool) {
  try {
    if (!global._pgPool) {
      const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
      global._pgPool = new Pool({
        connectionString: dbUrl,
        ssl: isLocalhost ? false : { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    }
    pool = global._pgPool;
    isPostgresAvailable = true;
    console.log("==================================================");
    console.log("   [DATABASE] Connexion au serveur PostgreSQL Cloud configurée.");
    console.log("==================================================");
  } catch (err) {
    console.error("   [DATABASE ERREUR] Impossible d'initialiser le pool PostgreSQL :", err.message);
  }
} else {
  console.warn("==================================================");
  console.warn("   [ATTENTION DATABASE] Variable DATABASE_URL manquante !");
  console.warn("   L'application utilise un stockage local temporaire.");
  console.warn("   Pour garantir la persistance permanente, veuillez définir DATABASE_URL (ex: Supabase / Neon).");
  console.warn("==================================================");
}

/**
 * Execute SQL Query against PostgreSQL pool
 */
async function query(text, params) {
  if (!pool) throw new Error("Pool PostgreSQL non disponible.");
  return await pool.query(text, params);
}

/**
 * Execute a function within an ACID transaction
 */
async function withTransaction(callback) {
  if (!pool) throw new Error("Pool PostgreSQL non disponible.");
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Add entry to Audit Log table
 */
async function addAuditLog({ userId, userName, action, tableName, recordId, oldVal, newVal, details }, customClient = null) {
  const logId = Date.now().toString() + Math.random().toString(36).substring(2, 7);
  const q = `INSERT INTO audit_logs (id, user_id, user_name, action, table_name, record_id, ancienne_valeur, nouvelle_valeur, details, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`;
  const params = [
    logId,
    userId || 'system',
    userName || 'Système',
    action,
    tableName || null,
    recordId || null,
    oldVal ? JSON.stringify(oldVal) : null,
    newVal ? JSON.stringify(newVal) : null,
    details || null
  ];

  try {
    if (customClient) {
      await customClient.query(q, params);
    } else if (pool) {
      await pool.query(q, params);
    }
  } catch (err) {
    console.error("Erreur lors de l'enregistrement du journal d'audit :", err);
  }
}

/**
 * Initialize Database Schema from schema.sql
 */
async function initDb() {
  if (!isPostgresAvailable || !pool) return false;

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(sql);
      console.log("   [DATABASE] Schéma SQL PostgreSQL vérifié et appliqué avec succès.");
      
      // Ensure initial Admin account in users table if missing
      const adminEmail = "zubiksservice@gmail.com";
      const userRes = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [adminEmail]);
      if (userRes.rows.length === 0) {
        const adminPassHash = bcrypt.hashSync("Zubiks@2000", 10);
        await pool.query(
          `INSERT INTO users (id, nom_complet, email, password_hash, role, status)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (email) DO NOTHING`,
          ['admin-001', 'Admin ZUBIKS', adminEmail, adminPassHash, 'admin', 'active']
        );
        console.log("   [DATABASE] Compte administrateur principal initialisé en base PostgreSQL.");
      }
      return true;
    }
  } catch (err) {
    console.error("   [DATABASE ERREUR] Échec d'initialisation du schéma PostgreSQL :", err);
    return false;
  }
}

// ----------------------------------------------------
// FALLBACK FILE HELPERS (Used when DATABASE_URL is missing)
// ----------------------------------------------------
function readFallbackFile() {
  if (fs.existsSync(FALLBACK_DB_FILE)) {
    try {
      const data = fs.readFileSync(FALLBACK_DB_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed.credentials && !parsed.credentials.passwordHash && parsed.credentials.password) {
        parsed.credentials.passwordHash = bcrypt.hashSync(parsed.credentials.password, 10);
        delete parsed.credentials.password;
      }
      return parsed;
    } catch (e) {
      console.error("Erreur de lecture fallback DB file:", e);
    }
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function writeFallbackFile(state) {
  try {
    fs.writeFileSync(FALLBACK_DB_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error("Erreur d'écriture fallback DB file:", e);
  }
}

// ----------------------------------------------------
// FULL APP STATE MANAGEMENT (PostgreSQL OR Fallback)
// ----------------------------------------------------
async function getFullState() {
  if (!isPostgresAvailable || !pool) {
    return readFallbackFile();
  }

  try {
    // Read from app_settings
    const settingsRes = await pool.query('SELECT key, value FROM app_settings');
    const settingsMap = {};
    settingsRes.rows.forEach(r => { settingsMap[r.key] = r.value; });

    // Read members
    const membersRes = await pool.query(
      `SELECT id, user_id, nom, postnom, sexe, email, telephone, adresse, parts, 
              total_depot AS "totalDepot", total_retrait AS "totalRetrait", 
              status, date_ajout AS "dateAjout"
       FROM members 
       WHERE deleted_at IS NULL 
       ORDER BY date_ajout ASC`
    );

    // Read deleted members
    const deletedRes = await pool.query(
      `SELECT id, email, nom, deleted_at AS "deletedAt"
       FROM members 
       WHERE deleted_at IS NOT NULL`
    );

    // Read transactions
    const txRes = await pool.query(
      `SELECT t.id, t.member_id AS "memberId", m.nom AS "memberName", t.type, 
              t.montant, t.nombre_parts AS "parts", t.date_transaction AS "date", 
              t.mode_paiement AS "modePaiement", t.reference
       FROM transactions t
       LEFT JOIN members m ON t.member_id = m.id
       ORDER BY t.date_transaction DESC`
    );

    // Read daily_archives & cycle_archives
    const dailyArchRes = await pool.query('SELECT * FROM daily_archives ORDER BY created_at DESC');
    const cycleArchRes = await pool.query('SELECT * FROM cycle_archives ORDER BY date_archivage DESC');

    // Read messages
    const msgRes = await pool.query(
      `SELECT id, member_id AS "memberId", sender, sender_name AS "senderName", 
              text, timestamp, read_by_admin AS "readByAdmin", read_by_user AS "readByUser"
       FROM messages 
       ORDER BY timestamp ASC`
    );

    // Read Admin Credentials
    const adminRes = await pool.query("SELECT email, password_hash FROM users WHERE role = 'admin' LIMIT 1");
    let adminCreds = { email: "zubiksservice@gmail.com", passwordHash: bcrypt.hashSync("Zubiks@2000", 10) };
    if (adminRes.rows.length > 0) {
      adminCreds = {
        email: adminRes.rows[0].email,
        passwordHash: adminRes.rows[0].password_hash
      };
    }

    // Build calculations
    let dailyDepots = 0;
    let dailyRetraits = 0;
    let cycleDepots = 0;
    let cycleRetraits = 0;

    const todayStr = new Date().toISOString().split('T')[0];
    txRes.rows.forEach(tx => {
      const txAmount = parseFloat(tx.montant) || 0;
      const txDateStr = new Date(tx.date).toISOString().split('T')[0];

      if (tx.type === 'depot') {
        cycleDepots += txAmount;
        if (txDateStr === todayStr) dailyDepots += txAmount;
      } else if (tx.type === 'retrait') {
        cycleRetraits += txAmount;
        if (txDateStr === todayStr) dailyRetraits += txAmount;
      }
    });

    return {
      members: membersRes.rows,
      dailyDepots,
      dailyRetraits,
      cycleDepots,
      cycleRetraits,
      argentDebut: parseFloat(settingsMap['argentDebut']) || 0,
      reglements: settingsMap['reglements'] || "",
      archives: cycleArchRes.rows.map(c => c.snapshot_data || c),
      dailyArchives: dailyArchRes.rows.map(d => ({
        id: d.id,
        date: d.date_jour,
        argentDebut: parseFloat(d.argent_debut),
        dailyDepots: parseFloat(d.total_depots),
        dailyRetraits: parseFloat(d.total_retraits),
        soldeFinal: parseFloat(d.solde_cloture)
      })),
      transactions: txRes.rows,
      deletedMembers: deletedRes.rows,
      messages: msgRes.rows,
      credentials: adminCreds
    };
  } catch (err) {
    console.error("Erreur de lecture PostgreSQL getFullState :", err);
    return readFallbackFile();
  }
}

/**
 * Save Full State transactionally into PostgreSQL
 */
async function saveFullState(newState, auditUser = null) {
  if (!isPostgresAvailable || !pool) {
    writeFallbackFile(newState);
    return true;
  }

  try {
    await withTransaction(async (client) => {
      // 1. App settings
      if (newState.argentDebut !== undefined) {
        await client.query(
          `INSERT INTO app_settings (key, value) VALUES ('argentDebut', $1::jsonb)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
          [JSON.stringify(newState.argentDebut)]
        );
      }
      if (newState.reglements !== undefined) {
        await client.query(
          `INSERT INTO app_settings (key, value) VALUES ('reglements', $1::jsonb)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
          [JSON.stringify(newState.reglements)]
        );
      }

      // 2. Members upsert
      if (Array.isArray(newState.members)) {
        for (const m of newState.members) {
          await client.query(
            `INSERT INTO members (id, nom, postnom, sexe, email, telephone, adresse, parts, total_depot, total_retrait, status, date_ajout, updated_at, deleted_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, NULL)
             ON CONFLICT (id) DO UPDATE SET
               nom = EXCLUDED.nom,
               postnom = EXCLUDED.postnom,
               sexe = EXCLUDED.sexe,
               email = EXCLUDED.email,
               parts = EXCLUDED.parts,
               total_depot = EXCLUDED.total_depot,
               total_retrait = EXCLUDED.total_retrait,
               status = EXCLUDED.status,
               updated_at = CURRENT_TIMESTAMP,
               deleted_at = NULL`,
            [
              String(m.id || Date.now()),
              m.nom || '',
              m.postnom || '',
              m.sexe || 'Homme',
              m.email || null,
              m.telephone || null,
              m.adresse || null,
              parseInt(m.parts || 0, 10),
              parseFloat(m.totalDepot || m.totalPaye || 0),
              parseFloat(m.totalRetrait || 0),
              m.status || 'pending',
              m.dateAjout ? new Date(m.dateAjout) : new Date()
            ]
          );

          // If member has password, update/create corresponding user entry
          if (m.email && (m.passwordHash || m.password)) {
            const hash = m.passwordHash || bcrypt.hashSync(m.password, 10);
            await client.query(
              `INSERT INTO users (id, nom_complet, email, password_hash, role, status)
               VALUES ($1, $2, $3, $4, 'user', $5)
               ON CONFLICT (email) DO UPDATE SET
                 nom_complet = EXCLUDED.nom_complet,
                 password_hash = EXCLUDED.password_hash,
                 status = EXCLUDED.status,
                 updated_at = CURRENT_TIMESTAMP`,
              [
                `user-${m.id}`,
                m.nom || 'Membre',
                m.email.toLowerCase(),
                hash,
                m.status || 'active'
              ]
            );
          }
        }
      }

      // 3. Transactions upsert
      if (Array.isArray(newState.transactions)) {
        for (const t of newState.transactions) {
          if (!t.id) continue;
          await client.query(
            `INSERT INTO transactions (id, member_id, type, montant, nombre_parts, date_transaction, mode_paiement, reference)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO NOTHING`,
            [
              String(t.id),
              t.memberId ? String(t.memberId) : null,
              t.type || 'depot',
              parseFloat(t.montant || 0),
              parseInt(t.parts || 0, 10),
              t.date ? new Date(t.date) : new Date(),
              t.modePaiement || 'cash',
              t.reference || null
            ]
          );
        }
      }

      // 4. Deleted members soft delete update
      if (Array.isArray(newState.deletedMembers)) {
        for (const d of newState.deletedMembers) {
          if (!d.id && !d.email) continue;
          if (d.id) {
            await client.query(
              `UPDATE members SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`,
              [String(d.id)]
            );
          } else if (d.email) {
            await client.query(
              `UPDATE members SET deleted_at = CURRENT_TIMESTAMP WHERE LOWER(email) = LOWER($1)`,
              [d.email]
            );
          }
        }
      }

      // 5. Daily Archives
      if (Array.isArray(newState.dailyArchives)) {
        for (const da of newState.dailyArchives) {
          const daId = String(da.id || Date.now());
          await client.query(
            `INSERT INTO daily_archives (id, date_jour, argent_debut, total_depots, total_retraits, solde_cloture)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO NOTHING`,
            [
              daId,
              da.date || new Date().toISOString(),
              parseFloat(da.argentDebut || 0),
              parseFloat(da.dailyDepots || 0),
              parseFloat(da.dailyRetraits || 0),
              parseFloat(da.soldeFinal || 0)
            ]
          );
        }
      }

      // 6. Admin credentials
      if (newState.credentials && newState.credentials.email) {
        const adminEmail = newState.credentials.email.toLowerCase();
        let hash = newState.credentials.passwordHash;
        if (!hash && newState.credentials.password) {
          hash = bcrypt.hashSync(newState.credentials.password, 10);
        }
        if (hash) {
          await client.query(
            `INSERT INTO users (id, nom_complet, email, password_hash, role, status)
             VALUES ('admin-001', 'Admin ZUBIKS', $1, $2, 'admin', 'active')
             ON CONFLICT (email) DO UPDATE SET
               password_hash = EXCLUDED.password_hash,
               updated_at = CURRENT_TIMESTAMP`,
            [adminEmail, hash]
          );
        }
      }

      // 7. Write Audit Log entry
      if (auditUser) {
        await addAuditLog({
          userId: auditUser.id || auditUser.email,
          userName: auditUser.nom || auditUser.email,
          action: 'SAVE_STATE',
          tableName: 'multiple',
          details: `Mise à jour de l'état de l'application par ${auditUser.nom || auditUser.email}`
        }, client);
      }
    });

    writeFallbackFile(newState);
    return true;
  } catch (err) {
    console.error("Erreur de sauvegarde PostgreSQL saveFullState :", err);
    writeFallbackFile(newState);
    return false;
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
  initDb,
  addAuditLog,
  getFullState,
  saveFullState,
  isPostgresConnected: () => isPostgresAvailable
};
