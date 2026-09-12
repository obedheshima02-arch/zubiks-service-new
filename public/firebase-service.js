// =====================================================
// firebase-service.js — Couche Service Firebase
// Remplace entièrement les API PHP (auth.php, members.php,
// transactions.php, messages.php, stats.php)
// =====================================================

const FirebaseService = (() => {

    // ─────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────
    const serverTs = () => firebase.firestore.FieldValue.serverTimestamp();
    const increment = (n) => firebase.firestore.FieldValue.increment(n);
    const arrayUnion = (...items) => firebase.firestore.FieldValue.arrayUnion(...items);

    // Convertit un Timestamp Firestore en ISO string ou garde la valeur telle quelle
    const toDateStr = (val) => {
        if (!val) return new Date().toISOString();
        if (val && typeof val.toDate === 'function') return val.toDate().toISOString();
        return val;
    };

    // Normalise un document Firestore en objet JS plat
    const docToObj = (snap) => {
        if (!snap.exists) return null;
        const d = snap.data();
        const obj = { id: snap.id, ...d };
        // Convertir les Timestamps en strings ISO
        if (d.dateAjout && typeof d.dateAjout.toDate === 'function') obj.dateAjout = d.dateAjout.toDate().toISOString();
        if (d.timestamp && typeof d.timestamp.toDate === 'function') obj.timestamp = d.timestamp.toDate().toISOString();
        if (d.date && typeof d.date.toDate === 'function') obj.date = d.date.toDate().toISOString().split('T')[0];
        return obj;
    };

    // ─────────────────────────────────────────────────
    // AUTH SERVICE
    // ─────────────────────────────────────────────────
    const authService = {

        /**
         * Connexion email/mot de passe
         * Retourne l'objet utilisateur enrichi depuis Firestore
         */
        login: async (email, password) => {
            const cred = await auth.signInWithEmailAndPassword(email.trim().toLowerCase(), password);
            const uid = cred.user.uid;

            // Forcer la lecture depuis le SERVEUR (bypass cache Firestore SDK)
            // Indispensable pour détecter que le statut a changé de 'pending' → 'active'
            let memberDoc = await db.collection('members').doc(uid).get({ source: 'server' });

            if (!memberDoc.exists) {
                // Premier login admin : créer le document admin automatiquement
                const statsDoc = await db.collection('global_stats').doc('main').get({ source: 'server' });
                const adminEmail = statsDoc.exists ? (statsDoc.data().adminEmail || 'zubiksservice@gmail.com') : 'zubiksservice@gmail.com';

                if (email.trim().toLowerCase() === adminEmail.toLowerCase()) {
                    const adminData = {
                        nom: 'Admin ZUBIKS',
                        email: email.trim().toLowerCase(),
                        role: 'admin',
                        status: 'active',
                        parts: 0,
                        totalDepot: 0,
                        totalRetrait: 0,
                        dateAjout: serverTs(),
                        notifications: [],
                        profilePhoto: ''
                    };
                    await db.collection('members').doc(uid).set(adminData);
                    memberDoc = await db.collection('members').doc(uid).get({ source: 'server' });
                } else {
                    // L'utilisateur existe dans Firebase Auth mais son document Firestore a été supprimé lors de la réinitialisation
                    const newMemberData = {
                        nom: cred.user.displayName || email.split('@')[0],
                        postnom: '',
                        sexe: 'M',
                        email: email.trim().toLowerCase(),
                        role: 'user',
                        status: 'pending',
                        parts: 1,
                        totalDepot: 0,
                        totalRetrait: 0,
                        dateAjout: new Date().toISOString(),
                        notifications: [],
                        profilePhoto: ''
                    };
                    await db.collection('members').doc(uid).set(newMemberData);
                    return { id: uid, ...newMemberData };
                }
            }

            const userData = docToObj(memberDoc);

            // Permettre l'accès aux membres même avec le statut 'pending'
            return userData;
        },

        /**
         * Inscription d'un nouveau membre (status: pending)
         */
        register: async (nom, postnom, sexe, email, password) => {
            let cred = null;
            let isRecreation = false;

            try {
                cred = await auth.createUserWithEmailAndPassword(email.trim().toLowerCase(), password);
            } catch (authErr) {
                // 💡 ASTUCE MAGIQUE (100% MOBILE) :
                // Si l'email est déjà utilisé (souvent suite à une réinitialisation où on a supprimé
                // le profil Firestore mais pas le compte Auth), on essaie de le connecter avec le mot de passe fourni.
                if (authErr.code === 'auth/email-already-in-use') {
                    try {
                        cred = await auth.signInWithEmailAndPassword(email.trim().toLowerCase(), password);
                        isRecreation = true; // Succès ! C'est un ancien compte, on va écraser/récréer son profil.
                    } catch (signInErr) {
                        // Le mot de passe est incorrect (soit c'est un vrai autre utilisateur, soit il a oublié son mdp)
                        throw authErr;
                    }
                } else {
                    throw authErr;
                }
            }

            const uid = cred.user.uid;

            const memberData = {
                nom: nom.trim(),
                postnom: (postnom || '').trim(),
                sexe: sexe || 'M',
                email: email.trim().toLowerCase(),
                role: 'user',
                status: 'pending',
                parts: 1,
                totalDepot: 0,
                totalRetrait: 0,
                dateAjout: new Date().toISOString(), // ISO string pour éviter les pb de serverTimestamp offline
                notifications: [],
                profilePhoto: ''
            };

            try {
                // Écrase ou crée le document dans Firestore
                await db.collection('members').doc(uid).set(memberData);
            } catch (firestoreErr) {
                // Si l'écriture Firestore échoue et qu'on vient de le créer, on nettoie
                if (!isRecreation) {
                    try { await cred.user.delete(); } catch (e) {}
                }
                throw new Error("Erreur lors de l'enregistrement du profil. Vérifiez votre connexion et réessayez.");
            }

            // Envoyer l'email de vérification seulement s'il est tout nouveau
            if (!isRecreation) {
                try { await cred.user.sendEmailVerification(); } catch (e) {}
            }

            // L'utilisateur reste connecté afin de pouvoir accéder directement à son interface (statut 'pending')
            return { id: uid, ...memberData, isRecreation };
        },


        /**
         * Déconnexion
         */
        logout: async () => {
            await auth.signOut();
        },

        /**
         * Envoyer un email de réinitialisation via Firebase Auth (fiable, sans cURL)
         */
        sendPasswordReset: async (email) => {
            await auth.sendPasswordResetEmail(email.trim().toLowerCase(), {
                url: window.location.origin + window.location.pathname,
                handleCodeInApp: false
            });
        },

        /**
         * Changer le mot de passe de l'utilisateur connecté
         */
        changePassword: async (currentPassword, newPassword) => {
            const user = auth.currentUser;
            if (!user || !user.email) throw new Error('Aucun utilisateur connecté.');

            // Ré-authentification requise
            const cred = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
            await user.reauthenticateWithCredential(cred);
            await user.updatePassword(newPassword);
        },

        /**
         * Observer sur l'état de connexion
         */
        onAuthStateChanged: (callback) => {
            return auth.onAuthStateChanged(callback);
        },

        getCurrentUser: () => auth.currentUser
    };

    // ─────────────────────────────────────────────────
    // MEMBERS SERVICE
    // ─────────────────────────────────────────────────
    const membersService = {

        /**
         * Écoute en temps réel tous les membres
         * Remplace le polling PHP de membres
         */
        subscribe: (callback) => {
            return db.collection('members')
                .orderBy('dateAjout', 'asc')
                .onSnapshot(snap => {
                    const members = snap.docs.map(docToObj).filter(Boolean);
                    callback(members);
                }, err => console.error('[Members] snapshot error:', err));
        },

        /**
         * Récupérer un membre par UID
         */
        get: async (uid) => {
            const snap = await db.collection('members').doc(uid).get();
            return docToObj(snap);
        },

        /**
         * Ajouter un membre manuellement (sans Firebase Auth — ajout admin)
         */
        add: async (nom, parts, postnom, sexe, email) => {
            const newId = 'manual_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            const data = {
                nom: nom.trim(),
                postnom: (postnom || '').trim(),
                sexe: sexe || 'M',
                email: (email || '').trim().toLowerCase(),
                role: 'user',
                status: 'active',
                parts: parseInt(parts) || 1,
                totalDepot: 0,
                totalRetrait: 0,
                dateAjout: serverTs(),
                notifications: [],
                profilePhoto: ''
            };
            await db.collection('members').doc(newId).set(data);
            return { id: newId, ...data };
        },

        /**
         * Mettre à jour les infos d'un membre
         */
        update: async (uid, nom, parts, postnom, sexe) => {
            const updateData = { nom: nom.trim(), parts: parseInt(parts) || 1 };
            if (postnom !== undefined) updateData.postnom = postnom.trim();
            if (sexe !== undefined) updateData.sexe = sexe;
            await db.collection('members').doc(uid).update(updateData);
        },

        /**
         * Supprimer un membre
         */
        delete: async (uid) => {
            // Supprimer les messages du membre
            const msgs = await db.collection('messages').where('memberId', '==', uid).get();
            const batch = db.batch();
            msgs.forEach(d => batch.delete(d.ref));
            batch.delete(db.collection('members').doc(uid));
            await batch.commit();
        },

        /**
         * Valider un membre en attente (status pending → active)
         */
        validate: async (uid, parts) => {
            const notif = {
                id: 'notif_' + Date.now(),
                message: `🎉 Votre compte a été validé par l'administrateur avec ${parts} part(s) attribuée(s). Vous pouvez désormais effectuer vos opérations cash !`,
                date: new Date().toISOString(),
                read: false
            };
            await db.collection('members').doc(uid).update({
                status: 'active',
                parts: parseInt(parts) || 1,
                notifications: arrayUnion(notif)
            });
        },

        /**
         * Mettre à jour la photo de profil d'un membre
         */
        updatePhoto: async (uid, photoUrl) => {
            await db.collection('members').doc(uid).update({ profilePhoto: photoUrl });
        },

        /**
         * Marquer toutes les notifications d'un membre comme lues
         */
        markNotifsRead: async (uid, notifications) => {
            const readNotifs = (notifications || []).map(n => ({ ...n, read: true }));
            await db.collection('members').doc(uid).update({ notifications: readNotifs });
        },

        /**
         * Ajouter une notification à un membre
         */
        addNotification: async (uid, message) => {
            const notif = {
                id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                message,
                date: new Date().toISOString(),
                read: false
            };
            await db.collection('members').doc(uid).update({
                notifications: arrayUnion(notif)
            });
            return notif;
        },

        /**
         * Promouvoir/rétrograder le rôle d'un membre
         */
        updateRole: async (uid, role) => {
            await db.collection('members').doc(uid).update({ role });
        },

        /**
         * Réinitialiser le mot de passe d'un membre via Firebase Auth
         */
        resetPassword: async (email) => {
            await auth.sendPasswordResetEmail(email.trim().toLowerCase());
        }
    };

    // ─────────────────────────────────────────────────
    // TRANSACTIONS SERVICE
    // ─────────────────────────────────────────────────
    const transactionsService = {

        /**
         * Écoute en temps réel toutes les transactions
         */
        subscribe: (callback) => {
            return db.collection('transactions')
                .orderBy('timestamp', 'asc')
                .onSnapshot(snap => {
                    const txs = snap.docs.map(docToObj).filter(Boolean);
                    callback(txs);
                }, err => console.error('[Transactions] snapshot error:', err));
        },

        /**
         * Ajouter une transaction (dépôt ou retrait)
         * Met à jour atomiquement : transactions + membres + global_stats
         */
        add: async (memberId, memberNom, type, amount, adminNom) => {
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const txId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            const amt = parseFloat(amount);

            // Validation côté client (miroir de transactions.php)
            const memberDoc = await db.collection('members').doc(memberId).get();
            if (!memberDoc.exists) throw new Error('Membre introuvable.');

            const m = memberDoc.data();
            const parts = Math.max(1, parseInt(m.parts) || 1);
            const currentDepot = parseFloat(m.totalDepot) || 0;
            const currentRetrait = parseFloat(m.totalRetrait) || 0;

            if (type === 'depot') {
                if (amt < 1000) throw new Error('Dépôt refusé : Le montant minimum est de 1 000 Fc.');
                const maxDepot = parts * 63000;
                if (currentDepot + amt > maxDepot) {
                    const reste = Math.max(0, maxDepot - currentDepot);
                    throw new Error(`Dépôt refusé : Pour ${parts} part(s), le cumul max est ${maxDepot.toLocaleString('fr-FR')} Fc. Reste : ${reste.toLocaleString('fr-FR')} Fc.`);
                }
            } else if (type === 'retrait') {
                if (amt < 62000) throw new Error('Retrait refusé : Le montant minimum à retirer est de 62 000 Fc.');
                const maxRetrait = parts * 62000;
                if (currentRetrait + amt > maxRetrait) {
                    const reste = Math.max(0, maxRetrait - currentRetrait);
                    throw new Error(`Retrait refusé : Plafond max ${maxRetrait.toLocaleString('fr-FR')} Fc. Reste : ${reste.toLocaleString('fr-FR')} Fc.`);
                }
            }

            // Transaction atomique Firestore (batch write)
            const batch = db.batch();

            // 1. Enregistrer la transaction
            batch.set(db.collection('transactions').doc(txId), {
                memberId,
                memberNom,
                type,
                amount: amt,
                date: dateStr,
                timestamp: serverTs(),
                adminNom: adminNom || 'Admin'
            });

            // 2. Mettre à jour le membre
            const memberUpdate = type === 'depot'
                ? { totalDepot: increment(amt) }
                : { totalRetrait: increment(amt) };
            batch.update(db.collection('members').doc(memberId), memberUpdate);

            // 3. Mettre à jour global_stats
            const statsUpdate = type === 'depot'
                ? { dailyDepots: increment(amt), cycleDepots: increment(amt) }
                : { dailyRetraits: increment(amt), cycleRetraits: increment(amt) };
            batch.update(db.collection('global_stats').doc('main'), statsUpdate);

            await batch.commit();

            // 4. Ajouter notification + message au membre (après le batch pour éviter les conflits)
            const formattedAmt = amt.toLocaleString('fr-FR') + ' Fc';
            const dateFormatted = now.toLocaleDateString('fr-FR');
            const notifText = type === 'depot'
                ? `💳 Confirmation : Un dépôt de ${formattedAmt} a été effectué sur votre compte le ${dateFormatted}.`
                : `💸 Confirmation : Un retrait de ${formattedAmt} a été effectué sur votre compte le ${dateFormatted}.`;
            const chatText = type === 'depot'
                ? `💳 CONFIRMATION DE DÉPÔT : Votre compte a été crédité de ${formattedAmt} le ${dateFormatted} par l'administration (${adminNom}).`
                : `💸 CONFIRMATION DE RETRAIT : Un retrait de ${formattedAmt} a été effectué sur votre compte le ${dateFormatted} par l'administration (${adminNom}).`;

            const notif = {
                id: 'notif_tx_' + txId,
                message: notifText,
                date: now.toISOString(),
                read: false
            };

            await db.collection('members').doc(memberId).update({
                notifications: arrayUnion(notif)
            });

            await db.collection('messages').add({
                memberId,
                sender: 'admin',
                senderName: adminNom || 'Admin',
                text: chatText,
                timestamp: serverTs(),
                readByAdmin: true,
                readByUser: false
            });

            return { id: txId, memberId, memberNom, type, amount: amt, date: dateStr, adminNom };
        }
    };

    // ─────────────────────────────────────────────────
    // MESSAGES SERVICE
    // ─────────────────────────────────────────────────
    const messagesService = {

        /**
         * Écoute en temps réel tous les messages
         */
        subscribe: (callback) => {
            return db.collection('messages')
                .orderBy('timestamp', 'asc')
                .onSnapshot(snap => {
                    const msgs = snap.docs.map(docToObj).filter(Boolean);
                    callback(msgs);
                }, err => console.error('[Messages] snapshot error:', err));
        },

        /**
         * Envoyer un message (user ou admin)
         */
        send: async (memberId, sender, senderName, text) => {
            const ref = await db.collection('messages').add({
                memberId,
                sender,
                senderName,
                text: text.trim(),
                timestamp: serverTs(),
                readByAdmin: sender === 'admin',
                readByUser: sender === 'user'
            });
            return ref.id;
        },

        /**
         * Marquer les messages d'un membre comme lus
         */
        markRead: async (memberId, readBy) => {
            const field = readBy === 'admin' ? 'readByAdmin' : 'readByUser';
            const senderFilter = readBy === 'admin' ? 'user' : 'admin';

            const snap = await db.collection('messages')
                .where('memberId', '==', memberId)
                .where('sender', '==', senderFilter)
                .get();

            const batch = db.batch();
            snap.forEach(d => batch.update(d.ref, { [field]: true }));
            await batch.commit();
        },

        /**
         * Diffuser une annonce à tous les membres actifs
         */
        broadcast: async (text, senderName, memberIds) => {
            const batch = db.batch();
            let count = 0;
            for (const memberId of memberIds) {
                const ref = db.collection('messages').doc();
                batch.set(ref, {
                    memberId,
                    sender: 'admin',
                    senderName: senderName || 'Administration',
                    text: text.trim(),
                    timestamp: serverTs(),
                    readByAdmin: true,
                    readByUser: false
                });
                count++;
            }
            await batch.commit();
            return count;
        }
    };

    // ─────────────────────────────────────────────────
    // STATS SERVICE
    // ─────────────────────────────────────────────────
    const statsService = {

        /**
         * S'assure que le document global_stats/main existe
         */
        ensureExists: async () => {
            const ref = db.collection('global_stats').doc('main');
            const snap = await ref.get();
            if (!snap.exists) {
                await ref.set({
                    dailyDepots: 0,
                    dailyRetraits: 0,
                    cycleDepots: 0,
                    cycleRetraits: 0,
                    argentDebut: 0,
                    reglements: '',
                    adminEmail: 'zubiksservice@gmail.com',
                    profilePhoto: ''
                });
            }
        },

        /**
         * Écoute en temps réel les stats globales + archives
         */
        subscribe: (callback) => {
            return db.collection('global_stats').doc('main')
                .onSnapshot(async snap => {
                    const statsData = snap.exists ? snap.data() : {};

                    const archivesSnap = await db.collection('archives').orderBy('date', 'desc').get();
                    const archives = archivesSnap.docs.map(docToObj);

                    const dailyArchivesSnap = await db.collection('daily_archives').orderBy('date', 'desc').get();
                    const dailyArchives = dailyArchivesSnap.docs.map(docToObj);

                    callback({ stats: statsData, archives, dailyArchives });
                }, err => console.error('[Stats] snapshot error:', err));
        },

        /**
         * Mettre à jour les règlements
         */
        updateReglements: async (text) => {
            await db.collection('global_stats').doc('main').update({ reglements: text });
        },

        /**
         * Mettre à jour la photo de profil admin
         */
        updateAdminPhoto: async (photoUrl) => {
            await db.collection('global_stats').doc('main').update({ profilePhoto: photoUrl });
        },

        /**
         * Archiver la journée (reset dailyDepots / dailyRetraits)
         */
        archiveDay: async (dailyDepots, dailyRetraits) => {
            const now = new Date();
            const archiveId = 'day_' + Date.now();
            const batch = db.batch();

            batch.set(db.collection('daily_archives').doc(archiveId), {
                date: now.toISOString().split('T')[0],
                dailyDepots: parseFloat(dailyDepots) || 0,
                dailyRetraits: parseFloat(dailyRetraits) || 0,
                solde: (parseFloat(dailyDepots) || 0) - (parseFloat(dailyRetraits) || 0)
            });

            batch.update(db.collection('global_stats').doc('main'), {
                dailyDepots: 0,
                dailyRetraits: 0
            });

            await batch.commit();
        },

        /**
         * Archiver le cycle complet et réinitialiser les compteurs
         */
        archiveCycle: async (cycleDepots, cycleRetraits) => {
            const now = new Date();
            const archiveId = 'cycle_' + Date.now();

            // 1. Archiver le cycle
            await db.collection('archives').doc(archiveId).set({
                date: now.toISOString(),
                cycleDepots: parseFloat(cycleDepots) || 0,
                cycleRetraits: parseFloat(cycleRetraits) || 0,
                solde: (parseFloat(cycleDepots) || 0) - (parseFloat(cycleRetraits) || 0)
            });

            // 2. Réinitialiser global_stats
            await db.collection('global_stats').doc('main').update({
                cycleDepots: 0,
                cycleRetraits: 0,
                dailyDepots: 0,
                dailyRetraits: 0
            });

            // 3. Réinitialiser totalDepot/totalRetrait de tous les membres
            const membersSnap = await db.collection('members').get();
            const notifMsg = "🚀 Un nouveau cycle de ristourne (63 jours / 9 semaines) vient d'être lancé par l'administration ! Vos compteurs ont été réinitialisés.";
            const notifId = 'notif_cycle_' + Date.now();

            const batch = db.batch();
            membersSnap.forEach(d => {
                if (d.data().role !== 'admin') {
                    const notif = {
                        id: notifId + '_' + d.id,
                        message: notifMsg,
                        date: now.toISOString(),
                        read: false
                    };
                    batch.update(d.ref, {
                        totalDepot: 0,
                        totalRetrait: 0,
                        notifications: arrayUnion(notif)
                    });
                }
            });
            await batch.commit();

            // 4. Supprimer toutes les transactions
            const txSnap = await db.collection('transactions').get();
            const txBatch = db.batch();
            txSnap.forEach(d => txBatch.delete(d.ref));
            await txBatch.commit();
        },

        /**
         * Reset complet de l'application (admin uniquement)
         * Supprime Firestore + stocke les UIDs pour suppression Auth via script admin
         */
        resetApp: async () => {
            // 1. Récupérer tous les membres non-admin à supprimer
            const membersSnap = await db.collection('members').get();
            const batch1 = db.batch();
            const uidsToDelete = []; // UIDs Firebase Auth à supprimer

            membersSnap.forEach(d => {
                const data = d.data();
                if (data.role !== 'admin') {
                    batch1.delete(d.ref);
                    // Stocker l'UID pour suppression Auth (seulement les membres avec un vrai UID Firebase Auth)
                    // Les membres manuels (id commence par 'manual_') n'ont pas de compte Auth
                    if (!d.id.startsWith('manual_')) {
                        uidsToDelete.push({ uid: d.id, email: data.email || '', nom: data.nom || '' });
                    }
                }
            });
            await batch1.commit();

            // 2. Stocker la liste des UIDs à supprimer dans Firestore pour le script admin
            if (uidsToDelete.length > 0) {
                const deletionRef = db.collection('pending_auth_deletions').doc('queue');
                await deletionRef.set({
                    uids: uidsToDelete,
                    requestedAt: new Date().toISOString(),
                    processed: false
                });
            }

            // 3. Supprimer transactions, messages, archives
            const collections = ['transactions', 'messages', 'archives', 'daily_archives'];
            for (const col of collections) {
                const snap = await db.collection(col).get();
                const batch = db.batch();
                snap.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }

            // 4. Reset global_stats
            await db.collection('global_stats').doc('main').update({
                dailyDepots: 0, dailyRetraits: 0,
                cycleDepots: 0, cycleRetraits: 0,
                argentDebut: 0
            });

            return { deletedAuthCount: uidsToDelete.length };
        }

    };

    // ─────────────────────────────────────────────────
    // Export public
    // ─────────────────────────────────────────────────
    return { authService, membersService, transactionsService, messagesService, statsService };

})();

// Rendre disponible globalement
window.FirebaseService = FirebaseService;
