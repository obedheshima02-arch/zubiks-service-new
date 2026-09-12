// Script pour envoyer un email de réinitialisation
const { initializeApp } = require('firebase/app');
const { getAuth, sendPasswordResetEmail } = require('firebase/auth');

const firebaseConfig = {
    apiKey: "AIzaSyBM21ugp4QMx_78sBdWXPsC6JIhsCrRN4s",
    authDomain: "zservices-436f8.firebaseapp.com",
    projectId: "zservices-436f8",
    appId: "1:55846658070:web:4e2749fefea6b54a2bd537"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const email = process.argv[2] || 'zubiksservice@gmail.com';

async function main() {
    console.log(`Envoi du lien de reinitialisation a ${email}...`);
    try {
        await sendPasswordResetEmail(auth, email);
        console.log('✅ Lien envoye avec succes ! Verifiez la boite mail.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Erreur:', err.code, err.message);
        process.exit(1);
    }
}

main();
