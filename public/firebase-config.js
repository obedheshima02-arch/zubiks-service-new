// =====================================================
// firebase-config.js — Configuration & Initialisation Firebase
// Projet : ZUBIKS SERVICE
// =====================================================

const firebaseConfig = {
    apiKey: "AIzaSyBM21ugp4QMx_78sBdWXPsC6JIhsCrRN4s",
    authDomain: "zservices-436f8.firebaseapp.com",
    projectId: "zservices-436f8",
    storageBucket: "zservices-436f8.firebasestorage.app",
    messagingSenderId: "55846658070",
    appId: "1:55846658070:web:4e2749fefea6b54a2bd537",
    measurementId: "G-W594PTZFZJ"
};

// Initialiser Firebase (Compat SDK — accessible via firebase.auth(), firebase.firestore())
firebase.initializeApp(firebaseConfig);

// Services globaux
const auth = firebase.auth();
const db   = firebase.firestore();

// Langue des emails Firebase Auth (ex: mot de passe oublié) → Français
auth.languageCode = 'fr';

// Activer la persistance locale (l'utilisateur reste connecté même après fermeture du navigateur)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// Paramètres Firestore (cache hors-ligne pour les performances)
db.settings({ ignoreUndefinedProperties: true });
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    // Multi-onglets ou mode incognito : persistance désactivée (non bloquant)
    if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
        console.warn('[Firestore] Persistence warning:', err.code);
    }
});

console.log('[ZUBIKS] Firebase initialisé — Projet:', firebaseConfig.projectId);
