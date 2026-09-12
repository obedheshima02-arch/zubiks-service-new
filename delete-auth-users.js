/**
 * delete-auth-users.js — ZUBIKS SERVICE
 * Supprime les comptes Firebase Auth après réinitialisation.
 * Utilisation : node delete-auth-users.js
 * Aucune configuration requise (utilise firebase login existant)
 */

const admin = require('firebase-admin');
const https = require('https');
const os = require('os');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'zservices-436f8';
const API_KEY    = 'AIzaSyBM21ugp4QMx_78sBdWXPsC6JIhsCrRN4s';

// ── 1. Lire le refresh_token depuis la config Firebase CLI ───────────────────
function getFirebaseCliToken() {
    const candidates = [
        path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'),
        path.join(process.env.APPDATA  || '', 'configstore', 'firebase-tools.json'),
        path.join(process.env.LOCALAPPDATA || '', 'configstore', 'firebase-tools.json'),
        path.join(os.homedir(), 'AppData', 'Roaming', 'configstore', 'firebase-tools.json'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            try {
                const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
                const t = cfg.tokens;
                if (t && t.refresh_token) return t;
            } catch (_) {}
        }
    }
    return null;
}

// ── 2. Obtenir un access_token via OAuth2 ────────────────────────────────────
function refreshAccessToken(refreshToken) {
    return new Promise((resolve, reject) => {
        // Credentials publiques du Firebase CLI (github.com/firebase/firebase-tools)
        const body = JSON.stringify({
            client_id:     '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
            client_secret: 'j9iVZfS8aeaYe-AuuHMsCbE9',
            refresh_token: refreshToken,
            grant_type:    'refresh_token'
        });
        const req = https.request({
            hostname: 'oauth2.googleapis.com',
            path:     '/token',
            method:   'POST',
            headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ── 3. Appeler l'API REST Firebase pour supprimer un compte Auth ─────────────
function deleteFirebaseAuthUser(uid, accessToken) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ localId: uid });
        const req = https.request({
            hostname: 'identitytoolkit.googleapis.com',
            path:     `/v1/projects/${PROJECT_ID}/accounts/${uid}`,
            method:   'DELETE',
            headers:  {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type':  'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ── 4. Lire la file d'attente depuis Firestore via REST ─────────────────────
function firestoreGet(accessToken, docPath) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'firestore.googleapis.com',
            path:     `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`,
            method:   'GET',
            headers:  { 'Authorization': `Bearer ${accessToken}` }
        }, res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function firestorePatch(accessToken, docPath, fields) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ fields });
        const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
        const req = https.request({
            hostname: 'firestore.googleapis.com',
            path:     `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}?${mask}`,
            method:   'PATCH',
            headers:  {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type':  'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => resolve({ status: res.statusCode }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ── 5. Parser un document Firestore REST ────────────────────────────────────
function parseFirestoreDoc(doc) {
    if (!doc || !doc.fields) return null;
    const out = {};
    for (const [k, v] of Object.entries(doc.fields)) {
        if (v.stringValue !== undefined) out[k] = v.stringValue;
        else if (v.booleanValue !== undefined) out[k] = v.booleanValue;
        else if (v.arrayValue !== undefined) {
            out[k] = (v.arrayValue.values || []).map(item => {
                const obj = {};
                for (const [fk, fv] of Object.entries(item.mapValue?.fields || {})) {
                    obj[fk] = fv.stringValue ?? fv.booleanValue ?? fv.integerValue ?? '';
                }
                return obj;
            });
        }
    }
    return out;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n🔄 ZUBIKS SERVICE — Suppression des comptes membres Firebase Auth');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Obtenir le token Firebase CLI
    const storedTokens = getFirebaseCliToken();
    if (!storedTokens) {
        console.error('❌ Firebase CLI non connecté.');
        console.error('   Lancez d\'abord : firebase login');
        process.exit(1);
    }

    process.stdout.write('🔑 Obtention du token d\'accès... ');
    const tokenData = await refreshAccessToken(storedTokens.refresh_token);
    if (!tokenData.access_token) {
        console.error('\n❌ Impossible d\'obtenir un token. Reconnectez-vous : firebase login');
        process.exit(1);
    }
    const accessToken = tokenData.access_token;
    console.log('✅');

    // Lire la file d'attente Firestore
    process.stdout.write('📋 Lecture de la liste des comptes à supprimer... ');
    const queueDoc = await firestoreGet(accessToken, 'pending_auth_deletions/queue');
    const queue = parseFirestoreDoc(queueDoc);

    if (!queue) {
        console.log('\n✅ Aucune suppression en attente.');
        console.log('   (Effectuez d\'abord une "Réinitialisation" depuis l\'application.)');
        process.exit(0);
    }

    if (queue.processed === true) {
        console.log('\n✅ Déjà traité. Aucune action nécessaire.');
        process.exit(0);
    }

    const uids = queue.uids || [];
    if (uids.length === 0) {
        console.log('\n✅ Aucun compte Auth à supprimer.');
        process.exit(0);
    }

    console.log(`\n📋 ${uids.length} compte(s) à supprimer :\n`);
    uids.forEach((u, i) => console.log(`   ${i + 1}. ${u.nom || '—'} (${u.email})`));

    // Suppression
    console.log('\n🗑️  Suppression en cours...\n');
    let ok = 0, err = 0;
    for (const u of uids) {
        try {
            const res = await deleteFirebaseAuthUser(u.uid, accessToken);
            if (res.status === 200 || res.status === 204 || res.status === 404) {
                console.log(`   ✅ ${u.nom} (${u.email})`);
                ok++;
            } else {
                console.log(`   ⚠️  ${u.email} — HTTP ${res.status}`);
                err++;
            }
        } catch (e) {
            console.log(`   ❌ ${u.email} — ${e.message}`);
            err++;
        }
    }

    // Marquer comme traité
    await firestorePatch(accessToken, 'pending_auth_deletions/queue', {
        processed:   { booleanValue: true },
        processedAt: { stringValue: new Date().toISOString() }
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Terminé : ${ok} supprimé(s), ${err} erreur(s).`);
    console.log('Les membres peuvent maintenant se réinscrire avec les mêmes emails.\n');
}

main().catch(e => { console.error('\n❌ Erreur :', e.message); process.exit(1); });
