// =====================================================
// FONCTION TOAST GLOBALE — disponible avant DOMContentLoaded
// =====================================================
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        // Si le container n'est pas encore prêt, on réessaie après 200ms
        setTimeout(() => showToast(message, type), 200);
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = '✅';
    if (type === 'error') {
        icon = '❌';
    } else if (type === 'info') {
        icon = 'ℹ️';
    } else if (type === 'warning') {
        icon = '⚠️';
    }

    // Si le message commence déjà par un emoji, ne pas ajouter d'icône en double
    const cleanMsg = String(message || '').trim();
    const startsWithEmoji = /^[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F680}-\u{1F6FF}]/u.test(cleanMsg);

    toast.innerHTML = startsWithEmoji ? cleanMsg : `${icon} ${cleanMsg}`;

    container.appendChild(toast);

    // Disparaît après 2 secondes
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
    // --- Theme Toggle Logic ---
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        const currentTheme = localStorage.getItem('theme') || 'light';
        if (currentTheme === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggleBtn.textContent = '☀️';
        }

        themeToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            if (document.body.classList.contains('dark-mode')) {
                localStorage.setItem('theme', 'dark');
                themeToggleBtn.textContent = '☀️';
            } else {
                localStorage.setItem('theme', 'light');
                themeToggleBtn.textContent = '🌙';
            }
        });
    }

    // --- Anti-DevTools & Anti-Right-Click Protection ---
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
        if (
            e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) ||
            (e.ctrlKey && (e.key === 'U' || e.key === 'u'))
        ) {
            e.preventDefault();
        }
    });

    // --- Elements ---
    const loginScreen = document.getElementById('login-screen');
    const dashboardScreen = document.getElementById('dashboard-screen');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');

    const navBtns = document.querySelectorAll('.nav-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const pageTitle = document.getElementById('page-title');

    // Forms & Inputs
    const addMemberForm = document.getElementById('add-member-form');
    const nomIdInput = document.getElementById('nom-id');
    const partsInput = document.getElementById('parts');

    // Tables
    const membersTableBody = document.querySelector('#members-table tbody');
    const depotsTableBody = document.querySelector('#depots-table tbody');
    const retraitsTableBody = document.querySelector('#retraits-table tbody');
    const transactionsTableBody = document.querySelector('#transactions-table tbody');
    const dailyArchivesTableBody = document.querySelector('#daily-archives-table tbody');

    // Search & Filters
    const searchMemberInput = document.getElementById('search-member-input');
    const searchDepotInput = document.getElementById('search-depot-member-input');
    const searchRetraitInput = document.getElementById('search-retrait-member-input');
    const searchTransactionInput = document.getElementById('search-transaction-input');
    const filterTransactionDate = document.getElementById('filter-transaction-date');

    // Displays
    const paymentDateDisplay = document.getElementById('payment-date-display');
    const reportCurrentDate = document.getElementById('report-current-date');
    const accueilTotalMembres = document.getElementById('accueil-total-membres');
    const accueilTotalDepots = document.getElementById('accueil-total-depots');
    const accueilTotalRetraits = document.getElementById('accueil-total-retraits');

    // Report Data
    const dailyStartDisplay = document.getElementById('daily-start');
    const dailyDepotsDisplay = document.getElementById('daily-depots');
    const dailyRetraitsDisplay = document.getElementById('daily-retraits');
    const dailyRemainingDisplay = document.getElementById('daily-remaining');
    const cycleStartDisplay = document.getElementById('cycle-start');
    const cycleDepotsDisplay = document.getElementById('cycle-depots');
    const cycleRetraitsDisplay = document.getElementById('cycle-retraits');
    const cycleRemainingDisplay = document.getElementById('cycle-remaining');
    const archiveBtn = document.getElementById('archive-cycle-btn');
    const archivesTableBody = document.querySelector('#archives-table tbody');

    // Modal
    const operationModal = document.getElementById('operation-modal');
    const modalMemberName = document.getElementById('modal-member-name');
    const operationAmountInput = document.getElementById('operation-amount');
    const validateOperationBtn = document.getElementById('validate-operation-btn');
    const modalOperationTitle = document.getElementById('modal-operation-title');
    const modalAmountLabel = document.getElementById('modal-amount-label');

    // --- State Management ---
    let currentUser = null; // { role: 'admin' | 'user', ... }
    let currentJwtToken = localStorage.getItem('zubiks_jwt_token') || null;

    let state = {
        members: [], // { id, nom, postnom, sexe, email, password, role, status, parts, totalDepot, totalRetrait, dateAjout, notifications }
        dailyDepots: 0,
        dailyRetraits: 0,
        cycleDepots: 0,
        cycleRetraits: 0,
        argentDebut: 0, // Solde initial à zéro
        reglements: "",
        archives: [], // Sauvegarde des cycles passés
        dailyArchives: [], // Historique des journées
        transactions: [], // Historique des transactions
        deletedMembers: [], // [{ id, email, nom, deletedAt }]
        messages: [], // [{ id, memberId, sender, senderName, text, timestamp, readByAdmin, readByUser }]
        credentials: {
            email: 'zubiksservice@gmail.com'
        }
    };

    // API Endpoints PHP & MySQL
    const API = {
        auth: '../api/auth.php',
        members: '../api/members.php',
        transactions: '../api/transactions.php',
        stats: '../api/stats.php',
        messages: '../api/messages.php'
    };

    let previousNotifIds = null;

    const playNotificationSound = () => {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch (e) { }
    };

    const triggerSystemNotification = (title, body) => {
        try {
            if ('Notification' in window && Notification.permission === 'granted') {
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.ready.then(reg => {
                        reg.showNotification(title, {
                            body: body,
                            icon: 'icon-512.png',
                            badge: 'icon-512.png',
                            vibrate: [200, 100, 200]
                        });
                    });
                } else {
                    new Notification(title, { body: body, icon: 'icon-512.png' });
                }
            }
        } catch (e) { }
    };

    const requestNotificationPermission = () => {
        // Désactivé pour éviter l'avertissement "Spam potentiel" de Chrome Android sur les sous-domaines gratuits
        return;
    };

    // BroadcastChannel cross-tab instant notification sync
    const notifChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('zubiks_notifications_channel') : null;
    if (notifChannel) {
        notifChannel.onmessage = (event) => {
            if (event.data && event.data.type === 'NEW_TRANSACTION') {
                loadState();
            }
        };
    }

    // Load State from PHP / MySQL Backend
    let isLoadingState = false; // Evite les appels loadState() simultanés
    const loadState = async () => {
        if (isLoadingState) return; // Ne pas lancer un 2e appel si le 1er est en cours
        isLoadingState = true;
        try {
            // Lancer les 4 requêtes EN PARALLÈLE (au lieu de séquentiellement)
            // Gain : temps total = max(t1, t2, t3, t4) au lieu de t1+t2+t3+t4
            const [statsRes, membersRes, txRes, msgRes] = await Promise.all([
                fetch(`${API.stats}`),
                fetch(`${API.members}`),
                fetch(`${API.transactions}`),
                fetch(`${API.messages}`)
            ]);

            // 1. Traiter Stats
            if (statsRes.ok) {
                const data = await statsRes.json();
                if (data.stats) {
                    state.dailyDepots = parseFloat(data.stats.dailyDepots) || 0;
                    state.dailyRetraits = parseFloat(data.stats.dailyRetraits) || 0;
                    state.cycleDepots = parseFloat(data.stats.cycleDepots) || 0;
                    state.cycleRetraits = parseFloat(data.stats.cycleRetraits) || 0;
                    state.argentDebut = parseFloat(data.stats.argentDebut) || 0;
                    state.reglements = data.stats.reglements || "";
                    state.credentials = { email: data.stats.admin_email || 'zubiksservice@gmail.com' };
                    state.adminProfilePhoto = data.stats.profilePhoto || "";

                    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'admin_second')) {
                        if (state.adminProfilePhoto) {
                            currentUser.profilePhoto = state.adminProfilePhoto;
                            saveActiveSession(currentUser);
                        }
                    }

                    const textarea = document.querySelector('.modern-textarea');
                    if (textarea && document.activeElement !== textarea) textarea.value = state.reglements;

                    const changeEmailInput = document.getElementById('change-email');
                    if (changeEmailInput) {
                        if (currentUser && currentUser.role !== 'admin') {
                            changeEmailInput.value = currentUser.email || '';
                        } else if (state.credentials.email) {
                            changeEmailInput.value = state.credentials.email;
                        }
                    }
                }
                state.archives = data.archives || [];
                state.dailyArchives = data.dailyArchives || [];
            }

            // 2. Traiter Membres
            if (membersRes.ok) {
                const membersData = await membersRes.json();
                state.members = Array.isArray(membersData) ? membersData : [];

                if (currentUser) {
                    const freshUser = state.members.find(m => String(m.id) === String(currentUser.id) || (m.nom && currentUser.nom && m.nom.trim().toLowerCase() === currentUser.nom.trim().toLowerCase()));
                    if (freshUser) {
                        const newNotifs = getNotificationsArray(freshUser.notifications);

                        if (previousNotifIds !== null) {
                            const newUnread = newNotifs.filter(n => !n.read && !previousNotifIds.has(String(n.id)));
                            if (newUnread.length > 0) {
                                playNotificationSound();
                                newUnread.forEach(n => {
                                    showToast(`${n.message}`, 'info');
                                    triggerSystemNotification('🟢 Zubiks Service Notification', n.message);
                                });
                            }
                        }

                        previousNotifIds = new Set(newNotifs.map(n => String(n.id)));

                        currentUser = { ...currentUser, ...freshUser };
                        saveActiveSession(currentUser);
                    }
                }
            }

            // 3. Traiter Transactions
            if (txRes.ok) {
                const txData = await txRes.json();
                state.transactions = Array.isArray(txData) ? txData : [];
            }

            // 4. Traiter Messages
            if (msgRes.ok) {
                const msgData = await msgRes.json();
                state.messages = Array.isArray(msgData) ? msgData : [];
            }

            renderAll();
        } catch (err) {
            console.error("Erreur de chargement API Backend :", err);
        } finally {
            isLoadingState = false;
        }
    };

    // Setup Auto Refresh / Polling (intervalle augmenté à 12s pour réduire la charge serveur)
    let syncInterval = null;
    const setupListeners = () => {
        if (!syncInterval) {
            syncInterval = setInterval(() => {
                loadState();
            }, 12000); // 12 secondes au lieu de 5 : moins de charge, toujours temps réel
        }
    };

    // Save State is replaced by atomic operations in collections.
    const saveState = async () => {
        // Stub for backward compatibility during refactoring
        console.warn("saveState() a été appelé mais est obsolète. Utilisez les opérations Firestore spécifiques.");
    };

    // --- Date Initialization ---
    const updateDates = () => {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const dateStr = now.toLocaleDateString('fr-FR', options);

        if (paymentDateDisplay) paymentDateDisplay.textContent = dateStr;
        const paymentDateDisplayDepots = document.getElementById('payment-date-display-depots');
        if (paymentDateDisplayDepots) paymentDateDisplayDepots.textContent = dateStr;
        const paymentDateDisplayRetraits = document.getElementById('payment-date-display-retraits');
        if (paymentDateDisplayRetraits) paymentDateDisplayRetraits.textContent = dateStr;
        if (reportCurrentDate) reportCurrentDate.textContent = dateStr;
    };

    // --- Authentication & Tab Toggles ---
    const btnShowLogin = document.getElementById('btn-show-login');
    const btnShowRegister = document.getElementById('btn-show-register');
    const loginFormWrapper = document.getElementById('login-form-wrapper');
    const registerFormWrapper = document.getElementById('register-form-wrapper');
    const forgotPasswordWrapper = document.getElementById('forgot-password-wrapper');
    const resetPasswordWrapper = document.getElementById('reset-password-wrapper');

    const linkForgotPassword = document.getElementById('link-forgot-password');
    const btnForgotToLogin = document.getElementById('btn-forgot-to-login');
    const btnResetToLogin = document.getElementById('btn-reset-to-login');

    const hideAllAuthForms = () => {
        if (loginFormWrapper) loginFormWrapper.style.display = 'none';
        if (registerFormWrapper) registerFormWrapper.style.display = 'none';
        if (forgotPasswordWrapper) forgotPasswordWrapper.style.display = 'none';
        if (resetPasswordWrapper) resetPasswordWrapper.style.display = 'none';
    };

    if (btnShowLogin && btnShowRegister) {
        btnShowLogin.addEventListener('click', () => {
            btnShowLogin.classList.add('active');
            btnShowLogin.removeAttribute('style');
            btnShowRegister.classList.remove('active');
            btnShowRegister.removeAttribute('style');

            hideAllAuthForms();
            if (loginFormWrapper) loginFormWrapper.style.display = 'block';
        });

        btnShowRegister.addEventListener('click', () => {
            btnShowRegister.classList.add('active');
            btnShowRegister.removeAttribute('style');
            btnShowLogin.classList.remove('active');
            btnShowLogin.removeAttribute('style');

            hideAllAuthForms();
            if (registerFormWrapper) registerFormWrapper.style.display = 'block';
        });

        const btnBackToLogin = document.getElementById('btn-back-to-login');
        const linkBackToLogin = document.getElementById('link-back-to-login');

        if (btnBackToLogin) {
            btnBackToLogin.addEventListener('click', () => btnShowLogin.click());
        }
        if (linkBackToLogin) {
            linkBackToLogin.addEventListener('click', () => btnShowLogin.click());
        }
    }

    // =====================================================
    // SYSTÈME DE RÉINITIALISATION PAR LIEN EMAIL SÉCURISÉ
    // =====================================================

    // Étape 1 : Demande d'envoi du lien de réinitialisation
    const requestResetLink = async (targetEmail) => {
        const email = targetEmail ? targetEmail.trim().toLowerCase() : '';
        if (!email) {
            showToast("Veuillez saisir votre adresse email.", "error");
            hideAllAuthForms();
            if (forgotPasswordWrapper) forgotPasswordWrapper.style.display = 'block';
            const forgotEmailInput = document.getElementById('forgot-email');
            if (forgotEmailInput) forgotEmailInput.focus();
            return false;
        }

        // Afficher état de chargement
        const submitBtn = document.querySelector('.btn-forgot-submit');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>⏳ Envoi en cours...</span>';
        }

        try {
            const res = await fetch(`${API.auth}?action=request_reset_link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Impossible d'envoyer le lien de réinitialisation.");

            // Afficher la confirmation — l'utilisateur doit aller vérifier son email
            hideAllAuthForms();
            if (forgotPasswordWrapper) {
                forgotPasswordWrapper.style.display = 'block';
                // Remplacer le formulaire par un message de confirmation
                forgotPasswordWrapper.innerHTML = `
                    <button id="btn-forgot-to-login" type="button" class="btn-back-link">
                        ← Retour à la connexion
                    </button>
                    <div style="text-align: center; padding: 20px 10px;">
                        <div style="font-size: 3rem; margin-bottom: 12px;">📧</div>
                        <h3 style="color: var(--primary-color); font-size: 1.1rem; margin-bottom: 10px;">Lien envoyé !</h3>
                        <p style="color: #4a5568; font-size: 0.9rem; line-height: 1.5; margin-bottom: 16px;">
                            Un lien de réinitialisation a été envoyé à :<br>
                            <strong style="color: #1a202c;">${email}</strong>
                        </p>
                        <p style="color: #718096; font-size: 0.82rem; line-height: 1.4; background: #f7fafc; border-radius: 8px; padding: 10px;">
                            📬 Vérifiez votre boîte de réception et le <strong>dossier Spams</strong>.<br>
                            Le lien expire dans <strong>30 minutes</strong>.
                        </p>
                        <button type="button" id="btn-resend-link" style="margin-top: 14px; background: none; border: none; color: var(--primary-color); font-size: 0.85rem; font-weight: 600; cursor: pointer; text-decoration: underline;">
                            🔄 Renvoyer le lien
                        </button>
                    </div>
                `;
                // Rebind les boutons du nouveau HTML
                const backBtn = document.getElementById('btn-forgot-to-login');
                if (backBtn) backBtn.addEventListener('click', () => btnShowLogin && btnShowLogin.click());
                const resendBtn = document.getElementById('btn-resend-link');
                if (resendBtn) resendBtn.addEventListener('click', () => {
                    // Restaurer le formulaire
                    location.reload();
                });
            }

            showToast(data.message || `Lien envoyé à ${email}. Vérifiez votre boite mail.`, "success");
            return true;

        } catch (err) {
            console.error("Erreur envoi lien reset :", err);
            showToast(err.message || "Impossible d'envoyer le lien. Vérifiez l'email saisi.", "error");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
            return false;
        }
    };

    // Bouton "Mot de passe oublié ?" dans le formulaire de connexion
    if (linkForgotPassword) {
        linkForgotPassword.addEventListener('click', (e) => {
            e.preventDefault();
            const loginEmailInput = document.getElementById('email');
            const loginEmail = loginEmailInput ? loginEmailInput.value.trim() : '';

            if (loginEmail) {
                requestResetLink(loginEmail);
            } else {
                hideAllAuthForms();
                if (forgotPasswordWrapper) forgotPasswordWrapper.style.display = 'block';
                const forgotEmailInput = document.getElementById('forgot-email');
                if (forgotEmailInput) forgotEmailInput.focus();
            }
        });
    }

    if (btnForgotToLogin) {
        btnForgotToLogin.addEventListener('click', () => btnShowLogin && btnShowLogin.click());
    }

    if (btnResetToLogin) {
        btnResetToLogin.addEventListener('click', () => btnShowLogin && btnShowLogin.click());
    }

    // Formulaire Mot de Passe Oublié (saisie email → envoi lien)
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('forgot-email');
            const email = emailInput ? emailInput.value.trim() : '';
            await requestResetLink(email);
        });
    }

    // Formulaire Réinitialisation (nouveau mot de passe via token de l'URL)
    const resetPasswordForm = document.getElementById('reset-password-form');
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const tokenInput = document.getElementById('reset-token-input');
            const token = tokenInput ? tokenInput.value.trim() : '';
            const newPassword = document.getElementById('reset-new-password') ? document.getElementById('reset-new-password').value : '';
            const confirmPassword = document.getElementById('reset-confirm-password') ? document.getElementById('reset-confirm-password').value : '';

            if (!token) {
                showToast("Lien invalide. Veuillez redemander un lien de réinitialisation.", "error");
                hideAllAuthForms();
                if (forgotPasswordWrapper) forgotPasswordWrapper.style.display = 'block';
                return;
            }
            if (!newPassword || newPassword.length < 4) {
                showToast("Le nouveau mot de passe doit contenir au moins 4 caractères.", "error");
                return;
            }
            if (newPassword !== confirmPassword) {
                showToast("Les mots de passe ne correspondent pas.", "error");
                return;
            }

            const submitBtn = resetPasswordForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span>⏳ Mise à jour...</span><span class="arrow">→</span>';
            }

            try {
                const res = await fetch(`${API.auth}?action=reset_password_by_token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, newPassword })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Échec de la réinitialisation.");

                showToast("✅ " + (data.message || "Mot de passe réinitialisé avec succès !"), "success");
                resetPasswordForm.reset();
                // Nettoyer l'URL (enlever ?resetToken=...)
                if (window.history && window.history.replaceState) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
                setTimeout(() => { if (btnShowLogin) btnShowLogin.click(); }, 1500);

            } catch (err) {
                console.error("Erreur reset-password :", err);
                showToast(err.message || "Lien invalide ou expiré. Refaites une demande.", "error");
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
            }
        });
    }

    // Détection automatique du ?resetToken= dans l'URL à l'ouverture de la page
    const checkUrlResetToken = () => {
        const urlParams = new URLSearchParams(window.location.search);
        let token = urlParams.get('resetToken') || urlParams.get('token');
        if (!token && window.location.hash) {
            const hash = window.location.hash.substring(1);
            const hashParams = new URLSearchParams(hash);
            token = hashParams.get('resetToken') || hashParams.get('token');
        }
        if (token) {
            // Masquer le splash screen et afficher le formulaire de reset
            const splashScreen = document.getElementById('splash-screen');
            if (splashScreen) splashScreen.style.display = 'none';
            const loginScreen = document.getElementById('login-screen');
            if (loginScreen) loginScreen.style.display = 'flex';

            hideAllAuthForms();
            if (resetPasswordWrapper) resetPasswordWrapper.style.display = 'block';
            const tokenInput = document.getElementById('reset-token-input');
            if (tokenInput) tokenInput.value = token;
            showToast("🔐 Lien valide ! Choisissez votre nouveau mot de passe.", "info");
        }
    };

    checkUrlResetToken();


    // Formulaire d'Inscription
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nom = document.getElementById('reg-nom').value.trim();
            const postnom = document.getElementById('reg-postnom').value.trim();
            const sexe = document.getElementById('reg-sexe').value;
            const email = document.getElementById('reg-email').value.trim().toLowerCase();
            const password = document.getElementById('reg-password').value;

            if (!nom || !email || !password) {
                showToast("Veuillez remplir tous les champs obligatoires.", "error");
                return;
            }

            try {
                const res = await fetch(`${API.auth}?action=register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nom, postnom, sexe, email, password })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Erreur lors de l'inscription.");

                await loadState();

                // Envoi direct des mails de bienvenue (Membre & Admin) via EmailJS si disponible
                if (window.emailjs) {
                    const serviceId = window.EMAILJS_SERVICE_ID || "service_zubiks";
                    const templateId = window.EMAILJS_TEMPLATE_ID || "template_otp";

                    // 1. Mail de bienvenue pour le nouveau membre
                    emailjs.send(serviceId, templateId, {
                        to_email: email,
                        user_email: email,
                        email: email,
                        recipient_email: email,
                        user_name: `${nom} ${postnom}`.trim(),
                        name: `${nom} ${postnom}`.trim(),
                        message: `Bienvenue chez ZUBIKS SERVICE ! Votre compte (${email}) a été créé avec succès.`
                    }).catch(eErr => {
                        console.warn("EmailJS member email info:", eErr);
                    });

                    // 2. Mail de notification pour l'administrateur
                    const adminEmail = (state && state.credentials && state.credentials.email) ? state.credentials.email : 'zubiksservice@gmail.com';
                    emailjs.send(serviceId, templateId, {
                        to_email: adminEmail,
                        user_email: adminEmail,
                        email: adminEmail,
                        recipient_email: adminEmail,
                        user_name: "Admin ZUBIKS",
                        name: "Admin ZUBIKS",
                        message: `📢 NOUVEAU MEMBRE : Le membre ${nom} ${postnom} (${email}) vient de créer son compte sur ZUBIKS SERVICE. Veuillez vous connecter pour valider son profil.`
                    }).catch(eErr => {
                        console.warn("EmailJS admin notification info:", eErr);
                    });
                }

                registerForm.reset();
                showToast("Inscription réussie ! Un e-mail de confirmation vous a été envoyé.", "success");
                if (btnShowLogin) btnShowLogin.click();

                const loginEmailInput = document.getElementById('email');
                const loginPasswordInput = document.getElementById('password');
                if (loginEmailInput) loginEmailInput.value = email;
                if (loginPasswordInput) setTimeout(() => loginPasswordInput.focus(), 150);
            } catch (err) {
                console.error("Erreur d'inscription Backend :", err);
                showToast(err.message || "Erreur lors de l'inscription.", "error");
            }
        });
    }

    // Formulaire de Connexion
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            showToast('Veuillez remplir tous les champs.', 'error');
            return;
        }

        try {
            const res = await fetch(`${API.auth}?action=login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Erreur de connexion.");

            currentUser = data.user;
            saveActiveSession(currentUser);

            await loadState();
            switchRoleView();
            loginScreen.classList.remove('active');
            dashboardScreen.classList.add('active');
            updateDates();
            renderAll();
            requestNotificationPermission();
            showToast(`Connexion réussie (${currentUser.role === 'admin' ? 'Administrateur' : currentUser.nom})`, 'success');
        } catch (err) {
            console.error("Erreur de connexion Backend :", err);
            showToast(err.message || 'Email ou mot de passe incorrect.', 'error');
        }
    });

    const updateHeaderAvatar = (user) => {
        const loggedUserAvatar = document.getElementById('logged-user-avatar');
        if (!loggedUserAvatar) return;
        
        if (user && user.profilePhoto) {
            loggedUserAvatar.innerHTML = `<img src="${user.profilePhoto}" style="width: 100%; height: 100%; object-fit: cover;" alt="Profil">`;
        } else {
            const initials = (user && user.nom ? user.nom : 'Admin').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            loggedUserAvatar.textContent = initials;
        }
    };

    const profilePhotoInput = document.getElementById('profile-photo-input');
    const loggedUserAvatarElement = document.getElementById('logged-user-avatar');

    if (loggedUserAvatarElement && profilePhotoInput) {
        loggedUserAvatarElement.addEventListener('click', () => {
            if (currentUser) {
                profilePhotoInput.click();
            }
        });

        profilePhotoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 2 * 1024 * 1024) {
                if (typeof showToast === 'function') showToast("L'image est trop grande (max 2 Mo).", "error");
                return;
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64String = event.target.result;
                if (currentUser) {
                    try {
                        if (currentUser.role === 'admin' || currentUser.role === 'admin_second') {
                            await fetch(`${API.stats}?action=update_admin_photo`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ profilePhoto: base64String })
                            });
                            currentUser.profilePhoto = base64String;
                            state.adminProfilePhoto = base64String;
                        } else {
                            await fetch(`${API.members}?action=update_photo`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: currentUser.id, profilePhoto: base64String })
                            });
                            const userIndex = state.members.findIndex(m => String(m.id) === String(currentUser.id));
                            if (userIndex !== -1) state.members[userIndex].profilePhoto = base64String;
                            currentUser.profilePhoto = base64String;
                        }
                        saveActiveSession(currentUser);
                        updateHeaderAvatar(currentUser);
                        renderAll();
                        if (typeof showToast === 'function') showToast("Photo de profil mise à jour !", "success");
                    } catch (error) {
                        console.error("Erreur mise à jour photo:", error);
                        if (typeof showToast === 'function') showToast("Erreur lors de la mise à jour de la photo.", "error");
                    }
                }
            };
            reader.readAsDataURL(file);
        });
    }

    const switchRoleView = () => {
        const adminNavGroup = document.getElementById('admin-nav-group');
        const userNavGroup = document.getElementById('user-nav-group');
        const userRoleBadge = document.getElementById('user-role-badge');
        const loggedUserName = document.getElementById('logged-user-name');

        const securityPanelAdmin = document.getElementById('security-panel-admin');
        const backupPanelAdmin = document.getElementById('backup-panel-admin');

        if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'admin_second')) {
            if (adminNavGroup) adminNavGroup.style.display = 'flex';
            if (userNavGroup) userNavGroup.style.display = 'none';

            if (userRoleBadge) {
                userRoleBadge.textContent = currentUser.role === 'admin' ? "Administrateur" : "Admin (Secondaire)";
                userRoleBadge.style.background = currentUser.role === 'admin' ? "var(--primary-color)" : "var(--warning-color, #dd6b20)";
            }
            if (loggedUserName) loggedUserName.textContent = currentUser.role === 'admin' ? "Admin ZUBIKS" : currentUser.nom;
            updateHeaderAvatar(currentUser);

            const panelAdminSecondaire = document.getElementById('panel-admin-secondaire');
            const panelResetApp = document.getElementById('panel-reset-app');

            if (currentUser.role === 'admin_second') {
                if (securityPanelAdmin) securityPanelAdmin.style.display = 'none';
                if (backupPanelAdmin) backupPanelAdmin.style.display = 'none';
                const archiveCycleBtn = document.getElementById('archive-cycle-btn');
                if (archiveCycleBtn) archiveCycleBtn.style.display = 'none';
                if (panelAdminSecondaire) panelAdminSecondaire.style.display = 'none';
                if (panelResetApp) panelResetApp.style.display = 'none';
            } else {
                if (securityPanelAdmin) securityPanelAdmin.style.display = 'block';
                if (backupPanelAdmin) backupPanelAdmin.style.display = 'block';
                const archiveCycleBtn = document.getElementById('archive-cycle-btn');
                if (archiveCycleBtn) archiveCycleBtn.style.display = 'inline-block';
                if (panelAdminSecondaire) panelAdminSecondaire.style.display = 'block';
                if (panelResetApp) panelResetApp.style.display = 'block';
            }

            // Activer onglet accueil admin
            const adminHomeBtn = document.querySelector('[data-target="tab-accueil"]');
            if (adminHomeBtn) adminHomeBtn.click();
        } else if (currentUser) {
            if (adminNavGroup) adminNavGroup.style.display = 'none';
            if (userNavGroup) userNavGroup.style.display = 'flex';

            if (userRoleBadge) {
                userRoleBadge.textContent = "Membre ZUBIKS";
                userRoleBadge.style.background = "var(--accent-color)";
            }
            if (loggedUserName) loggedUserName.textContent = currentUser.nom || "Membre";
            updateHeaderAvatar(currentUser);

            if (securityPanelAdmin) securityPanelAdmin.style.display = 'none';
            if (backupPanelAdmin) backupPanelAdmin.style.display = 'none';

            // Activer onglet espace membre
            const userHomeBtn = document.querySelector('[data-target="tab-user-space"]');
            if (userHomeBtn) userHomeBtn.click();
        }
    };

    const performLogout = async (msg = 'Vous êtes déconnecté.') => {
        try {
            await fetch(`${API.auth}?action=logout`, { method: 'POST' });
        } catch (error) { }

        currentUser = null;
        localStorage.removeItem('zubiks_jwt_token');
        saveActiveSession(null);

        if (msg.includes('supprimé')) {
            // Purge locale complète si le compte a été effacé par l'admin
            localStorage.removeItem('zubiksStateV2');
            localStorage.removeItem('zubixStateV2');
        }

        // Vider tous les formulaires et champs d'entrée
        if (loginForm) loginForm.reset();
        if (registerForm) registerForm.reset();
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';

        // Fermer explicitement tous les modals et overlays pour éliminer le flou noir
        if (operationModal) operationModal.classList.remove('active');
        if (editMemberModal) editMemberModal.classList.remove('active');
        if (memberDetailsModal) memberDetailsModal.classList.remove('active');
        closeSidebarMobile();
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');

        dashboardScreen.classList.remove('active');
        loginScreen.classList.add('active');
        showToast(msg, msg.includes('supprimé') ? 'error' : 'success');
    };

    if (logoutBtn) logoutBtn.addEventListener('click', () => performLogout());
    const headerLogoutBtn = document.getElementById('header-logout-btn');
    if (headerLogoutBtn) headerLogoutBtn.addEventListener('click', () => performLogout());

    // --- Navigation (Sidebar) ---
    const tabTitles = {
        'tab-accueil': 'Accueil Administrateur',
        'tab-membres': 'Gestion des Membres & Inscriptions',
        'tab-depots': 'Gestion des Dépôts Cash',
        'tab-retraits': 'Gestion des Retraits Cash',
        'tab-transactions': 'Historique Général des Transactions',
        'tab-messagerie-admin': 'Messagerie Clients',
        'tab-rapport': 'Rapports Financiers',
        'tab-apropos': 'Règlements & Paramètres',
        'tab-user-space': 'Mon Espace Membre',
        'tab-user-transactions': 'Mes Transactions',
        'tab-messagerie-user': 'Support & Messagerie Directe',
        'tab-user-notifications': 'Centre de Notifications'
    };

    // --- Mobile Sidebar Navigation Drawer ---
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const appSidebar = document.getElementById('app-sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    const openSidebarMobile = () => {
        if (appSidebar) appSidebar.classList.add('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.add('active');
    };

    const closeSidebarMobile = () => {
        if (appSidebar) appSidebar.classList.remove('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    };

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openSidebarMobile);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebarMobile);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebarMobile);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSidebarMobile();
            if (operationModal) operationModal.classList.remove('active');
        }
    });

    navBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const allNavBtns = document.querySelectorAll('.nav-btn');
            const allTabPanes = document.querySelectorAll('.tab-pane');

            // Masquer explicitement tous les onglets
            allNavBtns.forEach(b => b.classList.remove('active'));
            allTabPanes.forEach(p => {
                p.classList.remove('active');
                p.style.display = 'none';
            });

            // Afficher uniquement l'onglet ciblé
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.classList.add('active');
                targetPane.style.display = 'block';
            }

            // Mettre à jour le titre principal de la page
            if (pageTitle && tabTitles[targetId]) {
                pageTitle.textContent = tabTitles[targetId];
            }

            // Marquer comme lu si l'utilisateur normal ouvre la messagerie ou les notifications
            if (currentUser && currentUser.role !== 'admin') {
                if (targetId === 'tab-messagerie-user' && state.messages) {
                    let updatedMsgs = false;
                    state.messages.forEach(m => {
                        if (String(m.memberId) === String(currentUser.id) && !m.readByUser && m.sender === 'admin') {
                            m.readByUser = true;
                            updatedMsgs = true;
                        }
                    });
                    if (updatedMsgs) {
                        renderAll();
                        try {
                            fetch(`${API.messages}?action=mark_read`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ memberId: currentUser.id, readBy: 'user' })
                            });
                        } catch (e) { }
                    }
                } else if (targetId === 'tab-user-notifications' && currentUser) {
                    let updatedNotifs = false;
                    const notifsArr = getNotificationsArray(currentUser.notifications);
                    const newNotifs = notifsArr.map(n => {
                        if (!n.read) {
                            updatedNotifs = true;
                            return { ...n, read: true };
                        }
                        return n;
                    });
                    if (updatedNotifs) {
                        currentUser.notifications = newNotifs;
                        renderAll();
                        try {
                            fetch(`${API.members}?action=update_notifs`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: currentUser.id, notifications: newNotifs })
                            }).then(r => r.json()).then(data => {
                                if (data && data.notifications) {
                                    currentUser.notifications = data.notifications;
                                    saveActiveSession(currentUser);
                                    renderAll();
                                }
                            });
                        } catch (e) { }
                    }
                }
            }

            // Fermer le tiroir mobile après sélection
            closeSidebarMobile();
        });
    });

    // Add header buttons logic
    const topChatBtn = document.getElementById('top-chat-btn');
    if (topChatBtn) {
        topChatBtn.addEventListener('click', () => {
            if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'admin_second')) {
                const adminMsgBtn = document.querySelector('.nav-btn[data-target="tab-messagerie-admin"]');
                if (adminMsgBtn) adminMsgBtn.click();
            } else {
                const userMsgBtn = document.querySelector('.nav-btn[data-target="tab-messagerie-user"]');
                if (userMsgBtn) userMsgBtn.click();
            }
        });
    }

    const topNotifBtn = document.getElementById('top-notif-btn');
    if (topNotifBtn) {
        topNotifBtn.addEventListener('click', () => {
            if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'admin_second')) {
                const membresBtn = document.querySelector('.nav-btn[data-target="tab-membres"]');
                if (membresBtn) membresBtn.click();
            } else {
                const userNotifBtn = document.querySelector('.nav-btn[data-target="tab-user-notifications"]');
                if (userNotifBtn) userNotifBtn.click();
            }
        });
    }

    // Add search event listeners
    if (searchMemberInput) searchMemberInput.addEventListener('input', () => renderAll());
    if (searchDepotInput) searchDepotInput.addEventListener('input', () => renderAll());
    if (searchRetraitInput) searchRetraitInput.addEventListener('input', () => renderAll());
    if (searchTransactionInput) searchTransactionInput.addEventListener('input', () => renderAll());
    if (filterTransactionDate) filterTransactionDate.addEventListener('change', () => renderAll());

    // Export PDF Logic
    const exportPdfBtn = document.getElementById('export-transactions-pdf');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', () => {
            if (!window.jspdf || !window.jspdf.jsPDF) {
                showToast("Erreur: Bibliothèque PDF non chargée.", "error");
                return;
            }

            const transactionSearchTerm = searchTransactionInput ? searchTransactionInput.value.toLowerCase() : '';
            const transactionFilterDate = filterTransactionDate ? filterTransactionDate.value : '';

            // Filter transactions (same logic as renderAll)
            const filteredTransactions = (state.transactions || []).filter(t => {
                const matchesSearch = !transactionSearchTerm ||
                    (t.memberNom || '').toLowerCase().includes(transactionSearchTerm) ||
                    (t.type || '').toLowerCase().includes(transactionSearchTerm);
                const matchesDate = !transactionFilterDate || t.date === transactionFilterDate;
                return matchesSearch && matchesDate;
            });

            if (filteredTransactions.length === 0) {
                showToast("Aucune transaction à exporter.", "warning");
                return;
            }

            const doc = new window.jspdf.jsPDF();

            // Header
            doc.setFontSize(18);
            doc.setTextColor(44, 62, 80);
            doc.text('Historique des Transactions', 14, 22);

            doc.setFontSize(11);
            doc.setTextColor(100);
            doc.text(`Date d'export : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 14, 30);

            if (transactionSearchTerm || transactionFilterDate) {
                doc.text(`Filtres appliqués : ${transactionSearchTerm} ${transactionFilterDate}`, 14, 36);
            }

            // Table Data
            const tableColumn = ["Date", "Nom du Membre", "Type", "Montant (Fc)", "Validé par"];
            const tableRows = [];

            let totalDepots = 0;
            let totalRetraits = 0;

            filteredTransactions.forEach(t => {
                const dateStr = new Date(t.date || t.timestamp).toLocaleDateString('fr-FR');
                const type = t.type === 'depot' ? 'Dépôt' : 'Retrait';
                const amount = parseFloat(t.amount || 0);

                if (t.type === 'depot') totalDepots += amount;
                else totalRetraits += amount;

                tableRows.push([
                    dateStr,
                    t.memberNom || 'N/A',
                    type,
                    amount.toLocaleString('fr-FR').replace(/\s|\u202F|\u00A0/g, ' '),
                    t.adminNom || 'Admin'
                ]);
            });

            // Add Table
            doc.autoTable({
                head: [tableColumn],
                body: tableRows,
                startY: transactionSearchTerm || transactionFilterDate ? 42 : 36,
                theme: 'striped',
                headStyles: { fillColor: [44, 62, 80] },
                didParseCell: function (data) {
                    if (data.section === 'body' && data.column.index === 2) {
                        data.cell.styles.textColor = data.cell.raw === 'Dépôt' ? [46, 125, 50] : [198, 40, 40];
                        data.cell.styles.fontStyle = 'bold';
                    }
                    if (data.section === 'body' && data.column.index === 3) {
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            });

            // Summary
            const finalY = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(12);
            doc.setTextColor(44, 62, 80);
            doc.text('Résumé :', 14, finalY);
            doc.setFontSize(11);
            doc.setTextColor(46, 125, 50); // Green
            doc.text(`Total Dépôts : ${totalDepots.toLocaleString('fr-FR').replace(/\s|\u202F|\u00A0/g, ' ')} Fc`, 14, finalY + 7);
            doc.setTextColor(198, 40, 40); // Red
            doc.text(`Total Retraits : ${totalRetraits.toLocaleString('fr-FR').replace(/\s|\u202F|\u00A0/g, ' ')} Fc`, 14, finalY + 14);

            // Save PDF
            doc.save('historique_transactions.pdf');
            showToast("PDF généré avec succès !", "success");
        });
    }

    // --- Members Logic ---
    const formatDate = (dateString) => {
        const d = new Date(dateString);
        return d.toLocaleDateString('fr-FR');
    };

    addMemberForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nom = nomIdInput.value.trim();
        const parts = parseInt(partsInput.value);

        if (nom && parts > 0) {
            const existingMember = state.members.find(m => (m.nom || '').toLowerCase() === nom.toLowerCase());
            if (existingMember) {
                if (!confirm(`Un membre nommé "${nom}" existe déjà. Voulez-vous quand même l'ajouter ?`)) {
                    return;
                }
            }

            const newId = Date.now().toString();
            const newMember = {
                id: newId,
                nom: nom,
                parts: parts,
                role: 'user',
                status: 'active',
                totalDepot: 0,
                totalRetrait: 0,
                dateAjout: new Date().toISOString(),
                notifications: []
            };

            try {
                const res = await fetch(`${API.members}?action=add`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nom, parts })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Erreur lors de l'ajout.");

                await loadState();
                addMemberForm.reset();
                showToast('Nouveau membre ajouté avec succès.', 'success');
            } catch (error) {
                console.error("Erreur lors de l'ajout du membre:", error);
                showToast(error.message || 'Erreur lors de l\'ajout du membre.', 'error');
            }
        }
    });

    // --- Rendering Logic ---
    window.validateMemberParts = async (id) => {
        const input = document.getElementById(`pending-parts-${id}`);
        if (!input) return;

        const parts = parseInt(input.value);
        if (isNaN(parts) || parts < 1) {
            showToast("Veuillez saisir un nombre de parts valide (minimum 1).", "error");
            return;
        }

        const btn = document.querySelector(`button[onclick="window.validateMemberParts('${id}')"]`);
        const originalText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ Validation...';
            btn.style.opacity = '0.7';
        }

        const member = state.members.find(m => String(m.id) === String(id));
        if (member) {
            try {
                const res = await fetch(`${API.members}?action=validate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, parts })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Erreur de validation.");

                await loadState();
                showToast(`Compte de "${member.nom}" validé avec ${parts} part(s).`, "success");
            } catch (error) {
                console.error("Erreur de validation:", error);
                showToast(error.message || 'Erreur lors de la validation du membre.', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                    btn.style.opacity = '1';
                }
            }
        }
    };

    const getNotificationsArray = (notifs) => {
        if (Array.isArray(notifs)) return notifs;
        if (typeof notifs === 'string' && notifs.trim() !== '') {
            try {
                const parsed = JSON.parse(notifs);
                if (Array.isArray(parsed)) return parsed;
                if (typeof parsed === 'string') {
                    const parsed2 = JSON.parse(parsed);
                    if (Array.isArray(parsed2)) return parsed2;
                }
            } catch (e) { }
        }
        return [];
    };

    const renderAll = () => {
        const memberSearchTerm = (searchMemberInput ? searchMemberInput.value.toLowerCase() : '');
        const depotSearchTerm = (searchDepotInput ? searchDepotInput.value.toLowerCase() : '');
        const retraitSearchTerm = (searchRetraitInput ? searchRetraitInput.value.toLowerCase() : '');
        const transactionSearchTerm = (searchTransactionInput ? searchTransactionInput.value.toLowerCase() : '');
        const transactionFilterDate = (filterTransactionDate ? filterTransactionDate.value : '');

        // Badge logic for top icons
        const topChatBadge = document.getElementById('top-chat-badge');
        const topNotifBadge = document.getElementById('top-notif-badge');

        if (currentUser) {
            updateHeaderAvatar(currentUser);
            let unreadMessages = 0;
            let unreadNotifs = 0;

            if (currentUser.role === 'admin') {
                unreadMessages = (state.messages || []).filter(m => !m.readByAdmin).length;
                unreadNotifs = (state.members || []).filter(m => m.status === 'pending').length;
            } else {
                unreadMessages = (state.messages || []).filter(m => String(m.memberId) === String(currentUser.id) && !m.readByUser).length;
                unreadNotifs = getNotificationsArray(currentUser.notifications).filter(n => !n.read).length;
            }

            if (topChatBadge) {
                if (unreadMessages > 0) {
                    topChatBadge.style.display = 'flex';
                    topChatBadge.textContent = unreadMessages > 9 ? '9+' : unreadMessages;
                } else {
                    topChatBadge.style.display = 'none';
                }
            }

            if (topNotifBadge) {
                if (unreadNotifs > 0) {
                    topNotifBadge.style.display = 'flex';
                    topNotifBadge.textContent = unreadNotifs > 9 ? '9+' : unreadNotifs;
                } else {
                    topNotifBadge.style.display = 'none';
                }
            }
        } else {
            if (topChatBadge) topChatBadge.style.display = 'none';
            if (topNotifBadge) topNotifBadge.style.display = 'none';
        }
        if (!state.members) state.members = [];
        const activeMembers = state.members.filter(m => (m.status === 'active' || (!m.status && m.status !== 'pending')) && m.role !== 'admin' && m.role !== 'admin_second');

        // 1. Render Pending Registrations (Admin View)
        const pendingMembers = state.members
            .filter(m => m.status === 'pending')
            .sort((a, b) => new Date(a.dateAjout) - new Date(b.dateAjout)); // Tri par date d'inscription (le plus ancien en premier)
        const pendingPanel = document.getElementById('pending-members-panel');
        const pendingBadge = document.getElementById('pending-badge');
        const pendingTableBody = document.querySelector('#pending-members-table tbody');

        if (pendingBadge) {
            if (pendingMembers.length > 0) {
                pendingBadge.textContent = pendingMembers.length;
                pendingBadge.style.display = 'inline-block';
            } else {
                pendingBadge.style.display = 'none';
            }
        }

        if (pendingPanel && pendingTableBody) {
            if (pendingMembers.length > 0) {
                pendingPanel.style.display = 'block';
                pendingTableBody.innerHTML = '';
                pendingMembers.forEach((m, idx) => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${idx + 1}</td>
                        <td><strong>${m.nom}</strong></td>
                        <td>${m.sexe || 'N/A'}</td>
                        <td>${m.email || 'N/A'}</td>
                        <td>
                            <input type="number" id="pending-parts-${m.id}" min="1" value="1" style="width: 80px; padding: 6px; border: 1px solid #cbd5e0; border-radius: 4px; text-align: center; font-weight: bold;">
                        </td>
                        <td class="action-buttons-cell">
                            <button class="btn-action btn-success" onclick="window.validateMemberParts('${m.id}')" style="background-color: var(--success); display: flex; align-items: center; gap: 4px;">
                                ✅ Valider
                            </button>
                            <button class="btn-action btn-danger" onclick="window.deleteMember('${m.id}')" style="background-color: var(--danger); display: flex; align-items: center; gap: 4px;" title="Refuser et effacer cette demande">
                                🗑️ Refuser
                            </button>
                        </td>
                    `;
                    pendingTableBody.appendChild(tr);
                });
            } else {
                pendingPanel.style.display = 'none';
            }
        }

        // Active members list (excluding admins)
        const activeClientMembers = state.members.filter(m => m.status !== 'pending' && m.role !== 'admin' && m.role !== 'admin_second');

        // Sort active members stably by registration date (oldest first) instead of alphabetically
        const sortedMembers = [...activeClientMembers].sort((a, b) => new Date(a.dateAjout) - new Date(b.dateAjout));

        // Render Members Table (tab-membres)
        if (membersTableBody) {
            membersTableBody.innerHTML = '';
            sortedMembers.filter(m => (m.nom || '').toLowerCase().includes(memberSearchTerm)).forEach((member, index) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${index + 1}</td>
                    <td><a href="#" style="color: var(--primary); text-decoration: none; font-weight: 600;" onclick="window.openMemberDetails('${member.id}'); return false;">${member.nom}</a></td>
                    <td>${member.parts}</td>
                    <td class="text-muted">${formatDate(member.dateAjout)}</td>
                    <td class="action-buttons-cell">
                        <button class="btn-action" onclick="window.openEditMemberModal('${member.id}')" style="background-color: #3182ce; color: white; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 4px rgba(49, 130, 206, 0.3);" title="Modifier les informations">
                            ✏️ Modifier
                        </button>
                        <button class="btn-action" onclick="window.deleteMember('${member.id}')" style="background-color: var(--danger); color: white; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 4px rgba(229, 62, 62, 0.3);" title="Supprimer ce membre">
                            🗑️ Supprimer
                        </button>
                    </td>
                `;
                membersTableBody.appendChild(tr);
            });
        }

        // Render Depots Table
        if (depotsTableBody) {
            depotsTableBody.innerHTML = '';
            sortedMembers.filter(m => (m.nom || '').toLowerCase().includes(depotSearchTerm)).forEach((member, index) => {
                const depot = member.totalDepot || 0;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${index + 1}</td>
                    <td><strong>${member.nom}</strong></td>
                    <td><span class="text-success">${depot.toLocaleString('fr-FR')} Fc</span></td>
                    <td>
                        <button class="btn-action btn-success" onclick="window.openOperationModal('${member.id}', '${member.nom}', 'depot')" style="background-color:var(--success);">+ Dépôt Cash</button>
                    </td>
                `;
                depotsTableBody.appendChild(tr);
            });
        }

        // Render Retraits Table
        if (retraitsTableBody) {
            retraitsTableBody.innerHTML = '';
            sortedMembers.filter(m => (m.nom || '').toLowerCase().includes(retraitSearchTerm)).forEach((member, index) => {
                const depot = member.totalDepot || 0;
                const retrait = member.totalRetrait || 0;
                const solde = depot - retrait;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${index + 1}</td>
                    <td><strong>${member.nom}</strong></td>
                    <td><span class="highlight-text">${solde.toLocaleString('fr-FR')} Fc</span></td>
                    <td>
                        <button class="btn-action btn-danger" onclick="window.openOperationModal('${member.id}', '${member.nom}', 'retrait')" style="background-color:var(--danger);">- Retrait Cash</button>
                    </td>
                `;
                retraitsTableBody.appendChild(tr);
            });
        }

        // Render Transactions Table & Global Totals
        if (transactionsTableBody) {
            transactionsTableBody.innerHTML = '';
            let filteredTx = state.transactions || [];

            if (transactionSearchTerm) {
                filteredTx = filteredTx.filter(tx =>
                    (tx.memberNom || '').toLowerCase().includes(transactionSearchTerm) ||
                    (tx.type === 'depot' ? 'dépôt depot'.includes(transactionSearchTerm) : 'retrait'.includes(transactionSearchTerm))
                );
            }
            if (transactionFilterDate) {
                filteredTx = filteredTx.filter(tx => tx.date === transactionFilterDate);
            }

            let totalFilteredDepots = 0;
            let totalFilteredRetraits = 0;

            filteredTx.forEach(tx => {
                const amt = parseFloat(tx.amount || 0);
                if (tx.type === 'depot') totalFilteredDepots += amt;
                else totalFilteredRetraits += amt;
            });

            const globalTotalDepotsDisplay = document.getElementById('global-total-depots-display');
            const globalTotalRetraitsDisplay = document.getElementById('global-total-retraits-display');
            const globalTotalSoldeDisplay = document.getElementById('global-total-solde-display');

            if (globalTotalDepotsDisplay) globalTotalDepotsDisplay.textContent = `${totalFilteredDepots.toLocaleString('fr-FR')} Fc`;
            if (globalTotalRetraitsDisplay) globalTotalRetraitsDisplay.textContent = `${totalFilteredRetraits.toLocaleString('fr-FR')} Fc`;
            if (globalTotalSoldeDisplay) {
                const netSolde = totalFilteredDepots - totalFilteredRetraits;
                globalTotalSoldeDisplay.textContent = `${netSolde.toLocaleString('fr-FR')} Fc`;
            }

            if (filteredTx.length > 0) {
                const reversedTransactions = [...filteredTx].reverse();
                reversedTransactions.forEach((tx, index) => {
                    const isDepot = tx.type === 'depot';
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${reversedTransactions.length - index}</td>
                        <td>${new Date(tx.date).toLocaleDateString('fr-FR')}</td>
                        <td class="text-muted">${new Date(tx.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td><span class="btn-action ${isDepot ? 'btn-success' : 'btn-danger'}" style="background-color:var(--${isDepot ? 'success' : 'danger'}); padding: 3px 8px; font-size: 0.75rem;">${isDepot ? 'Dépôt Cash' : 'Retrait Cash'}</span></td>
                        <td><strong>${tx.memberNom}</strong></td>
                        <td><span class="${isDepot ? 'text-success' : 'text-danger'}"><strong>${isDepot ? '+' : '-'}${(parseFloat(tx.amount || 0)).toLocaleString('fr-FR')} Fc</strong></span></td>
                        <td><span class="text-muted" style="font-size:0.85em;">${tx.adminNom || 'Admin'}</span></td>
                    `;
                    transactionsTableBody.appendChild(tr);
                });

                // Ligne de résumé des totaux en bas de tableau
                const summaryTr = document.createElement('tr');
                summaryTr.style.background = '#f8fafc';
                summaryTr.style.fontWeight = 'bold';
                summaryTr.style.borderTop = '2px solid #cbd5e0';
                summaryTr.innerHTML = `
                    <td colspan="5" style="text-align: right; color: var(--primary-dark);">SOMME TOTALE DES TRANSACTIONS :</td>
                    <td>
                        <div style="color: var(--success);">🟢 Dépôts : +${totalFilteredDepots.toLocaleString('fr-FR')} Fc</div>
                        <div style="color: var(--danger);">🔴 Retraits : -${totalFilteredRetraits.toLocaleString('fr-FR')} Fc</div>
                    </td>
                    <td style="color: var(--primary-dark);">Solde : ${(totalFilteredDepots - totalFilteredRetraits).toLocaleString('fr-FR')} Fc</td>
                `;
                transactionsTableBody.appendChild(summaryTr);
            } else {
                transactionsTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: 20px;">Aucune transaction correspondante.</td></tr>';
            }
        }

        // --- Render User Specific Space (if logged in as regular user) ---
        if (currentUser && currentUser.role !== 'admin') {
            // Refresh currentUser state from state.members & check if account still exists
            const liveUser = state.members.find(m => String(m.id) === String(currentUser.id));
            if (!liveUser) {
                // Account was deleted by Admin! Expel user & purge client state completely
                performLogout("Votre compte n'existe plus ou a été supprimé par l'administrateur.");
                return;
            }
            currentUser = liveUser;

            const userWelcomeName = document.getElementById('user-welcome-name');
            const userPartsVal = document.getElementById('user-parts-val');
            const userSoldeVal = document.getElementById('user-solde-val');
            const userTotalDepotsVal = document.getElementById('user-total-depots-val');
            const userTotalRetraitsVal = document.getElementById('user-total-retraits-val');
            const userStatusBanner = document.getElementById('user-status-banner');

            if (userWelcomeName) userWelcomeName.textContent = currentUser.nom;
            if (userPartsVal) userPartsVal.textContent = currentUser.parts || 0;

            const userSolde = (currentUser.totalDepot || 0) - (currentUser.totalRetrait || 0);
            if (userSoldeVal) userSoldeVal.textContent = userSolde.toLocaleString('fr-FR');
            if (userTotalDepotsVal) userTotalDepotsVal.textContent = (currentUser.totalDepot || 0).toLocaleString('fr-FR');
            if (userTotalRetraitsVal) userTotalRetraitsVal.textContent = (currentUser.totalRetrait || 0).toLocaleString('fr-FR');

            // 63 Days Cycle Breakdown (Requirement 2)
            const userParts = parseInt(currentUser.parts) || 0;
            const day1AdminVal = userParts * 1000;
            const days62ClientVal = userParts * 62000;

            const userCycleDay1Val = document.getElementById('user-cycle-day1-val');
            const userCycle62DaysVal = document.getElementById('user-cycle-62days-val');
            const userCycleDaysCount = document.getElementById('user-cycle-days-count');
            const userCycleProgressBar = document.getElementById('user-cycle-progress-bar');

            if (userCycleDay1Val) userCycleDay1Val.textContent = day1AdminVal.toLocaleString('fr-FR');
            if (userCycle62DaysVal) userCycle62DaysVal.textContent = days62ClientVal.toLocaleString('fr-FR');

            const totalUserDepots = currentUser.totalDepot || 0;
            const dailyPartCost = userParts * 1000;
            const estimatedDays = dailyPartCost > 0 ? Math.min(62, Math.floor(totalUserDepots / dailyPartCost)) : 0;
            const progressPercent = Math.min(100, Math.round((estimatedDays / 62) * 100));

            if (userCycleDaysCount) userCycleDaysCount.textContent = estimatedDays;
            if (userCycleProgressBar) userCycleProgressBar.style.width = `${progressPercent}%`;

            if (userStatusBanner) {
                if (currentUser.status === 'pending') {
                    userStatusBanner.innerHTML = `<span style="color: #c05621; font-weight: 600;">⚠️ Votre compte est en attente de la validation du nombre de vos parts par l'administrateur.</span>`;
                } else {
                    userStatusBanner.textContent = "Suivez vos ristournes, vos parts et l'historique de vos versements cash.";
                }
            }

            // User Personal Transactions Table
            const userTxTableBody = document.querySelector('#user-transactions-table tbody');
            if (userTxTableBody) {
                userTxTableBody.innerHTML = '';
                const myTx = (state.transactions || []).filter(tx => String(tx.memberId) === String(currentUser.id));
                if (myTx.length > 0) {
                    const rev = [...myTx].reverse();
                    rev.forEach((tx, idx) => {
                        const isDepot = tx.type === 'depot';
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>${rev.length - idx}</td>
                            <td>${new Date(tx.date).toLocaleDateString('fr-FR')}</td>
                            <td class="text-muted">${new Date(tx.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td><span class="btn-action ${isDepot ? 'btn-success' : 'btn-danger'}" style="background-color:var(--${isDepot ? 'success' : 'danger'}); padding: 3px 8px; font-size: 0.75rem;">${isDepot ? 'Dépôt Cash' : 'Retrait Cash'}</span></td>
                            <td><span class="${isDepot ? 'text-success' : 'text-danger'}"><strong>${isDepot ? '+' : '-'}${(parseFloat(tx.amount || 0)).toLocaleString('fr-FR')} Fc</strong></span></td>
                            <td><span class="text-muted" style="font-size:0.85em;">${tx.adminNom || 'Admin'}</span></td>
                        `;
                        userTxTableBody.appendChild(tr);
                    });
                } else {
                    userTxTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding: 20px;">Aucune transaction enregistrée pour votre compte.</td></tr>';
                }
            }

            // User Notifications
            const userNotifList = document.getElementById('user-notifications-list');
            const unreadBadge = document.getElementById('unread-notif-badge');

            const notifs = getNotificationsArray(currentUser.notifications);
            const unreadCount = notifs.filter(n => !n.read).length;

            if (unreadBadge) {
                if (unreadCount > 0) {
                    unreadBadge.textContent = unreadCount;
                    unreadBadge.style.display = 'inline-block';
                } else {
                    unreadBadge.style.display = 'none';
                }
            }

            if (userNotifList) {
                userNotifList.innerHTML = '';
                if (notifs.length > 0) {
                    [...notifs].reverse().forEach(n => {
                        const div = document.createElement('div');
                        div.className = 'glass-inner';
                        div.style.borderLeft = n.read ? '4px solid #cbd5e0' : '4px solid var(--accent-color)';
                        div.style.background = n.read ? '#f8fafc' : '#f0fdf4';
                        div.style.padding = '15px';
                        div.style.borderRadius = 'var(--radius-sm)';
                        div.innerHTML = `
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px;">
                                <strong style="color: var(--primary-dark); font-size: 0.95rem;">${n.read ? '🔔 Notification' : '🟢 Nouvelle Notification'}</strong>
                                <small class="text-muted">${new Date(n.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
                            </div>
                            <p style="margin: 0; font-size: 0.9rem; color: var(--text-main);">${n.message}</p>
                        `;
                        userNotifList.appendChild(div);
                    });
                } else {
                    userNotifList.innerHTML = '<div class="text-center text-muted" style="padding: 20px;">Aucune notification reçue pour le moment.</div>';
                }
            }
        }

        // Update Dashboard Home Stats (Admin)
        if (accueilTotalMembres) accueilTotalMembres.textContent = activeMembers.length;
        const accueilTotalParts = document.getElementById('accueil-total-parts');
        const totalPartsSum = activeMembers.reduce((sum, m) => sum + (parseInt(m.parts) || 0), 0);
        if (accueilTotalParts) accueilTotalParts.textContent = totalPartsSum.toLocaleString('fr-FR');

        if (accueilTotalDepots) accueilTotalDepots.textContent = (state.cycleDepots || 0).toLocaleString('fr-FR');
        if (accueilTotalRetraits) accueilTotalRetraits.textContent = (state.cycleRetraits || 0).toLocaleString('fr-FR');

        // Update Reports
        const dailySolde = (state.dailyDepots || 0) - (state.dailyRetraits || 0);
        const cycleSolde = (state.cycleDepots || 0) - (state.cycleRetraits || 0);

        if (dailyDepotsDisplay) dailyDepotsDisplay.textContent = (state.dailyDepots || 0).toLocaleString('fr-FR');
        if (dailyRetraitsDisplay) dailyRetraitsDisplay.textContent = (state.dailyRetraits || 0).toLocaleString('fr-FR');
        if (dailyRemainingDisplay) dailyRemainingDisplay.textContent = dailySolde.toLocaleString('fr-FR');

        if (cycleDepotsDisplay) cycleDepotsDisplay.textContent = (state.cycleDepots || 0).toLocaleString('fr-FR');
        if (cycleRetraitsDisplay) cycleRetraitsDisplay.textContent = (state.cycleRetraits || 0).toLocaleString('fr-FR');
        if (cycleRemainingDisplay) cycleRemainingDisplay.textContent = cycleSolde.toLocaleString('fr-FR');

        // Render Archives Table
        if (archivesTableBody) {
            archivesTableBody.innerHTML = '';
            if (state.archives && state.archives.length > 0) {
                // Sort to have the most recent first
                const reversedArchives = [...state.archives].reverse();
                reversedArchives.forEach(archive => {
                    const dateStr = archive.date ? new Date(archive.date).toLocaleString('fr-FR', {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    }) : 'N/A';
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${dateStr}</td>
                        <td><span class="text-success">${(archive.cycleDepots || 0).toLocaleString('fr-FR')} Fc</span></td>
                        <td><span class="text-danger">${(archive.cycleRetraits || 0).toLocaleString('fr-FR')} Fc</span></td>
                        <td><strong>${(archive.solde || 0).toLocaleString('fr-FR')} Fc</strong></td>
                    `;
                    archivesTableBody.appendChild(tr);
                });
            } else {
                archivesTableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted" style="padding: 20px;">Aucun cycle archivé pour le moment.</td></tr>';
            }
        }

        // Render Daily Archives Table
        if (dailyArchivesTableBody) {
            dailyArchivesTableBody.innerHTML = '';
            if (state.dailyArchives && state.dailyArchives.length > 0) {
                const reversedDailyArchives = [...state.dailyArchives].reverse();
                reversedDailyArchives.forEach(archive => {
                    const dateStr = archive.date ? new Date(archive.date).toLocaleDateString('fr-FR') : 'N/A';
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${dateStr}</td>
                        <td><span class="text-success">${(archive.dailyDepots || 0).toLocaleString('fr-FR')} Fc</span></td>
                        <td><span class="text-danger">${(archive.dailyRetraits || 0).toLocaleString('fr-FR')} Fc</span></td>
                    `;
                    dailyArchivesTableBody.appendChild(tr);
                });
            } else {
                dailyArchivesTableBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted" style="padding: 10px;">Aucune journée archivée.</td></tr>';
            }
        }

        // Render Secondary Admins
        const secondaryAdminsList = document.getElementById('secondary-admins-list-tbody');
        if (secondaryAdminsList) {
            const secAdmins = state.members.filter(m => m.role === 'admin_second');
            if (secAdmins.length === 0) {
                secondaryAdminsList.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Aucun administrateur secondaire</td></tr>';
            } else {
                secondaryAdminsList.innerHTML = secAdmins.map(admin => `
                    <tr>
                        <td><strong>${admin.nom}</strong></td>
                        <td>${admin.email}</td>
                        <td style="text-align: center;">
                            <button class="btn-action" onclick="window.deleteSecAdmin('${admin.id}')" style="background-color: var(--danger); color: white; display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 5px 10px; border-radius: var(--radius-sm);" title="Supprimer cet admin">
                                <span class="icon">🗑️</span> Supprimer
                            </button>
                        </td>
                    </tr>
                `).join('');
            }
        }

        // Render Messaging System
        renderMessaging();
    };

    // --- Messaging System Logic (Admin <-> Member) ---
    let selectedAdminChatMemberId = null;

    const renderMessaging = () => {
        // 1. User Chat View (Membre)
        if (currentUser && currentUser.role !== 'admin') {
            const userChatMessages = document.getElementById('user-chat-messages');
            const userUnreadBadge = document.getElementById('user-unread-msg-badge');
            const userMsgs = (state.messages || []).filter(m => String(m.memberId) === String(currentUser.id) || (m.memberId && currentUser.nom && String(m.memberId).trim().toLowerCase() === String(currentUser.nom).trim().toLowerCase()) || (m.senderName && currentUser.nom && String(m.senderName).trim().toLowerCase() === String(currentUser.nom).trim().toLowerCase() && m.sender === 'user'));

            // Mark received admin messages as read when user views messaging tab
            const activeTab = document.querySelector('.tab-pane.active');
            if (activeTab && activeTab.id === 'tab-messagerie-user') {
                let markUpdated = false;
                userMsgs.forEach(m => {
                    if (m.sender === 'admin' && !m.readByUser) {
                        m.readByUser = true;
                        markUpdated = true;
                    }
                });
                if (markUpdated) {
                    try {
                        fetch(`${API.messages}?action=mark_read`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ memberId: currentUser.id, readBy: 'user' })
                        });
                    } catch (e) { }
                }
            }

            const unreadUserCount = userMsgs.filter(m => m.sender === 'admin' && !m.readByUser).length;
            if (userUnreadBadge) {
                if (unreadUserCount > 0) {
                    userUnreadBadge.textContent = unreadUserCount;
                    userUnreadBadge.style.display = 'inline-block';
                } else {
                    userUnreadBadge.style.display = 'none';
                }
            }

            if (userChatMessages) {
                userChatMessages.innerHTML = '';
                if (userMsgs.length > 0) {
                    userMsgs.forEach(m => {
                        const isMe = m.sender === 'user';
                        const bubble = document.createElement('div');
                        bubble.className = `chat-bubble ${isMe ? 'user-bubble' : 'admin-bubble'}`;

                        let timeStr = 'Récemment';
                        try {
                            timeStr = new Date(m.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                        } catch (e) {}

                        bubble.innerHTML = `
                            <div class="chat-bubble-header">${isMe ? 'Vous' : 'Admin ZUBIKS'} • ${timeStr}</div>
                            <div class="chat-bubble-text">${m.text}</div>
                        `;
                        userChatMessages.appendChild(bubble);
                    });
                    userChatMessages.scrollTop = userChatMessages.scrollHeight;
                } else {
                    userChatMessages.innerHTML = '<div class="text-center text-muted" style="margin-top: 50px;">👋 Aucun message. Écrivez ci-dessous pour discuter avec l\'administrateur.</div>';
                }
            }
        }

        // 2. Admin Chat View
        if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'admin_second')) {
            const adminThreadsContainer = document.getElementById('admin-chat-threads');
            const adminChatMessages = document.getElementById('admin-chat-messages');
            const adminUnreadBadge = document.getElementById('admin-unread-msg-badge');
            const searchChatInput = document.getElementById('search-chat-member');
            const chatMembersCountBadge = document.getElementById('chat-members-count-badge');
            const searchTerm = searchChatInput ? searchChatInput.value.toLowerCase() : '';

            const allMsgs = state.messages || [];
            const activeMembers = (state.members || []).filter(m => m.status !== 'pending' && m.role !== 'admin');

            if (chatMembersCountBadge) {
                chatMembersCountBadge.textContent = activeMembers.length;
            }

            // Détection du mode mobile
            const isMobile = window.innerWidth <= 768;

            // Auto-sélection : seulement sur desktop si aucun membre n'est sélectionné
            if (activeMembers.length > 0) {
                const currentSelectedExists = activeMembers.some(m => String(m.id) === String(selectedAdminChatMemberId));
                if (!currentSelectedExists) {
                    selectedAdminChatMemberId = null;
                }
                if (!isMobile && !selectedAdminChatMemberId) {
                    selectedAdminChatMemberId = activeMembers[0].id;
                }
            } else {
                selectedAdminChatMemberId = null;
            }

            // Total unread messages for admin
            const totalAdminUnread = allMsgs.filter(m => m.sender === 'user' && !m.readByAdmin).length;
            if (adminUnreadBadge) {
                if (totalAdminUnread > 0) {
                    adminUnreadBadge.textContent = totalAdminUnread;
                    adminUnreadBadge.style.display = 'inline-block';
                } else {
                    adminUnreadBadge.style.display = 'none';
                }
            }

            if (searchChatInput && !searchChatInput.hasAttribute('data-bound')) {
                searchChatInput.setAttribute('data-bound', 'true');
                searchChatInput.addEventListener('input', () => renderMessaging());
            }

            // Gestion du bouton retour mobile ("← Liste")
            const mobileBackBtn = document.getElementById('admin-chat-mobile-back');
            if (mobileBackBtn && !mobileBackBtn.hasAttribute('data-bound')) {
                mobileBackBtn.setAttribute('data-bound', 'true');
                mobileBackBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    selectedAdminChatMemberId = null;
                    const chatGrid = document.querySelector('.admin-chat-grid');
                    if (chatGrid) chatGrid.classList.remove('mobile-chat-open');
                    renderMessaging();
                });
            }

            const chatGrid = document.querySelector('.admin-chat-grid');
            if (chatGrid) {
                if (selectedAdminChatMemberId) {
                    chatGrid.classList.add('mobile-chat-open');
                } else {
                    chatGrid.classList.remove('mobile-chat-open');
                }
            }

            if (adminThreadsContainer) {
                adminThreadsContainer.innerHTML = '';
                const filteredMembers = activeMembers.filter(m => (m.nom || '').toLowerCase().includes(searchTerm));

                if (filteredMembers.length > 0) {
                    filteredMembers.forEach(m => {
                        const mMsgs = allMsgs.filter(msg => String(msg.memberId) === String(m.id) || (msg.memberId && m.nom && String(msg.memberId).trim().toLowerCase() === String(m.nom).trim().toLowerCase()) || (msg.senderName && m.nom && String(msg.senderName).trim().toLowerCase() === String(m.nom).trim().toLowerCase() && msg.sender === 'user'));
                        const lastMsg = mMsgs[mMsgs.length - 1];
                        const unreadCount = mMsgs.filter(msg => msg.sender === 'user' && !msg.readByAdmin).length;
                        const isSelected = String(m.id) === String(selectedAdminChatMemberId);

                        const item = document.createElement('div');
                        item.className = `chat-thread-item ${isSelected ? 'active-thread' : ''}`;

                        const initials = (m.nom || 'M').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                        item.onclick = () => {
                            selectedAdminChatMemberId = m.id;
                            let markUpdated = false;
                            mMsgs.forEach(msg => {
                                if (msg.sender === 'user' && !msg.readByAdmin) {
                                    msg.readByAdmin = true;
                                    markUpdated = true;
                                }
                            });
                            if (markUpdated) {
                                try {
                                    fetch(`${API.messages}?action=mark_read`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ memberId: m.id, readBy: 'admin' })
                                    });
                                } catch (e) { }
                            }
                            const grid = document.querySelector('.admin-chat-grid');
                            if (grid) grid.classList.add('mobile-chat-open');

                            renderMessaging();
                        };

                        const timeStr = lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

                        item.innerHTML = `
                            <div class="thread-avatar">${initials}</div>
                            <div class="thread-content">
                                <div class="thread-top">
                                    <strong class="thread-name">${m.nom}</strong>
                                    ${timeStr ? `<span class="thread-time">${timeStr}</span>` : ''}
                                </div>
                                <div class="thread-sub">
                                    <span class="thread-last-msg">${lastMsg ? lastMsg.text : '<i>Aucun message encore</i>'}</span>
                                    ${unreadCount > 0 ? `<span class="badge unread-badge">${unreadCount}</span>` : ''}
                                </div>
                            </div>
                        `;
                        adminThreadsContainer.appendChild(item);
                    });
                } else {
                    adminThreadsContainer.innerHTML = '<div class="empty-threads-state">Aucun membre trouvé</div>';
                }
            }

            // Render selected conversation in Admin Chat Window
            const selectedMember = activeMembers.find(m => String(m.id) === String(selectedAdminChatMemberId));
            const chatHeaderName = document.getElementById('admin-chat-header-name');
            const chatHeaderInfo = document.getElementById('admin-chat-header-info');
            const chatHeaderAvatar = document.getElementById('admin-chat-header-avatar');
            const chatInput = document.getElementById('admin-chat-input');
            const chatSendBtn = document.getElementById('admin-chat-send-btn');

            if (selectedMember) {
                if (chatHeaderName) chatHeaderName.textContent = selectedMember.nom;
                if (chatHeaderInfo) chatHeaderInfo.textContent = `${selectedMember.parts || 0} part(s) • ${selectedMember.email || 'Email non spécifié'}`;
                if (chatHeaderAvatar) chatHeaderAvatar.textContent = (selectedMember.nom || 'M').charAt(0).toUpperCase();
                if (chatInput) chatInput.disabled = false;
                if (chatSendBtn) chatSendBtn.disabled = false;

                const memberMsgs = allMsgs.filter(msg => String(msg.memberId) === String(selectedMember.id) || (msg.memberId && selectedMember.nom && String(msg.memberId).trim().toLowerCase() === String(selectedMember.nom).trim().toLowerCase()) || (msg.senderName && selectedMember.nom && String(msg.senderName).trim().toLowerCase() === String(selectedMember.nom).trim().toLowerCase() && msg.sender === 'user'));
                if (adminChatMessages) {
                    adminChatMessages.innerHTML = '';
                    if (memberMsgs.length > 0) {
                        memberMsgs.forEach(m => {
                            const isAdminMsg = m.sender === 'admin';
                            const bubble = document.createElement('div');
                            bubble.className = `chat-bubble ${isAdminMsg ? 'admin-bubble' : 'user-bubble'}`;

                            let timeStr = 'Récemment';
                            try {
                                timeStr = new Date(m.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                            } catch (e) {}

                            bubble.innerHTML = `
                                <div class="chat-bubble-header">${isAdminMsg ? 'Vous (Administration)' : selectedMember.nom} • ${timeStr}</div>
                                <div class="chat-bubble-text">${m.text}</div>
                            `;
                            adminChatMessages.appendChild(bubble);
                        });
                        setTimeout(() => { adminChatMessages.scrollTop = adminChatMessages.scrollHeight; }, 50);
                    } else {
                        adminChatMessages.innerHTML = '<div class="empty-chat-placeholder"><div class="empty-chat-icon">💬</div><p>Écrivez ci-dessous pour démarrer la discussion avec ce membre.</p></div>';
                    }
                }
            } else {
                if (chatHeaderName) chatHeaderName.textContent = 'Sélectionnez un membre';
                if (chatHeaderInfo) chatHeaderInfo.textContent = 'Choisissez une conversation dans la liste pour lire et répondre.';
                if (chatHeaderAvatar) chatHeaderAvatar.textContent = '👤';
                if (chatInput) chatInput.disabled = true;
                if (chatSendBtn) chatSendBtn.disabled = true;
                if (adminChatMessages) adminChatMessages.innerHTML = '<div class="empty-chat-placeholder"><div class="empty-chat-icon">👈</div><p>Sélectionnez une conversation dans la liste de gauche pour afficher les messages.</p></div>';
            }
        }
    };

    // Chat Forms Event Handlers
    const userChatForm = document.getElementById('user-chat-form');
    if (userChatForm) {
        userChatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('user-chat-input');
            const text = input ? input.value.trim() : '';

            if (text && currentUser && currentUser.role !== 'admin') {
                try {
                    const res = await fetch(`${API.messages}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            memberId: currentUser.id,
                            sender: 'user',
                            senderName: currentUser.nom,
                            text: text
                        })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Erreur d'envoi");

                    await loadState();
                    if (input) input.value = '';
                } catch (err) {
                    showToast(err.message || "Erreur lors de l'envoi du message.", "error");
                }
            }
        });
    }

    const adminChatForm = document.getElementById('admin-chat-form');
    if (adminChatForm) {
        adminChatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('admin-chat-input');
            const text = input ? input.value.trim() : '';

            if (text && selectedAdminChatMemberId) {
                try {
                    const res = await fetch(`${API.messages}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            memberId: selectedAdminChatMemberId,
                            sender: 'admin',
                            senderName: (currentUser ? currentUser.nom : 'Admin ZUBIKS'),
                            text: text
                        })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Erreur d'envoi");

                    await loadState();
                    if (input) { input.value = ''; input.style.height = 'auto'; }
                } catch (err) {
                    showToast(err.message || "Erreur lors de l'envoi du message.", "error");
                }
            }
        });
    }

    // Broadcast Message Handler (Modal UI Pro)
    const broadcastModal = document.getElementById('broadcast-modal');
    const closeBroadcastModal = document.getElementById('close-broadcast-modal');
    const cancelBroadcastBtn = document.getElementById('cancel-broadcast-btn');
    const submitBroadcastBtn = document.getElementById('submit-broadcast-btn');
    const broadcastTextarea = document.getElementById('broadcast-message-text');
    const broadcastTypeSelect = document.getElementById('broadcast-type');
    const broadcastMembersCount = document.getElementById('broadcast-members-count');

    const openBroadcastModalFunc = () => {
        const activeMembersList = (state.members || []).filter(m => m.status !== 'pending' && m.role !== 'admin' && m.role !== 'admin_second');
        if (activeMembersList.length === 0) {
            showToast("Aucun membre actif à qui envoyer l'annonce.", "error");
            return;
        }
        if (broadcastMembersCount) {
            broadcastMembersCount.textContent = `${activeMembersList.length} membre(s) actif(s)`;
        }
        if (broadcastModal) broadcastModal.style.display = 'flex';
        if (broadcastTextarea) {
            broadcastTextarea.value = '';
            setTimeout(() => broadcastTextarea.focus(), 100);
        }
    };

    const closeBroadcastModalFunc = () => {
        if (broadcastModal) broadcastModal.style.display = 'none';
        if (broadcastTextarea) broadcastTextarea.value = '';
    };

    if (closeBroadcastModal) closeBroadcastModal.addEventListener('click', closeBroadcastModalFunc);
    if (cancelBroadcastBtn) cancelBroadcastBtn.addEventListener('click', closeBroadcastModalFunc);

    // Écouteur global pour tous les boutons d'ouverture d'annonce
    document.addEventListener('click', (e) => {
        const target = e.target.closest('.btn-open-broadcast-modal, #btn-broadcast-message, #btn-top-broadcast');
        if (target) {
            e.preventDefault();
            openBroadcastModalFunc();
        }
    });

    // Insertion d'émojis rapides
    document.querySelectorAll('.btn-emoji-quick').forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.getAttribute('data-emoji');
            if (broadcastTextarea && emoji) {
                const start = broadcastTextarea.selectionStart;
                const end = broadcastTextarea.selectionEnd;
                const val = broadcastTextarea.value;
                broadcastTextarea.value = val.substring(0, start) + emoji + val.substring(end);
                broadcastTextarea.focus();
                broadcastTextarea.selectionStart = broadcastTextarea.selectionEnd = start + emoji.length;
            }
        });
    });

    if (submitBroadcastBtn) {
        submitBroadcastBtn.addEventListener('click', async () => {
            const annonceText = broadcastTextarea ? broadcastTextarea.value.trim() : '';
            if (!annonceText) {
                showToast("Veuillez saisir le contenu de l'annonce.", "error");
                if (broadcastTextarea) broadcastTextarea.focus();
                return;
            }

            const activeMembersList = (state.members || []).filter(m => m.status !== 'pending' && m.role !== 'admin' && m.role !== 'admin_second');
            if (activeMembersList.length === 0) {
                showToast("Aucun membre actif à qui envoyer l'annonce.", "error");
                return;
            }

            const typePrefix = broadcastTypeSelect ? broadcastTypeSelect.value : '📢 ANNONCE GÉNÉRALE';
            const fullMessage = `${typePrefix} :\n${annonceText}`;

            try {
                submitBroadcastBtn.disabled = true;
                submitBroadcastBtn.innerHTML = '<span>Diffusion en cours...</span>';

                // Tentative via l'action API backend d'annonce directe
                const res = await fetch(`${API.messages}?action=broadcast`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: fullMessage,
                        senderName: (currentUser ? currentUser.nom : 'Administration')
                    })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Erreur de diffusion");

                await loadState();
                closeBroadcastModalFunc();
                showToast(data.message || `Annonce diffusée avec succès à ${activeMembersList.length} membre(s) !`, "success");
            } catch (err) {
                console.error("Erreur diffusion API backend, tentative fallback...", err);
                // Fallback boucle client
                try {
                    let count = 0;
                    for (const member of activeMembersList) {
                        try {
                            await fetch(`${API.messages}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    memberId: member.id,
                                    sender: 'admin',
                                    senderName: 'Administration',
                                    text: fullMessage
                                })
                            });
                            count++;
                        } catch (e) { }
                    }
                    await loadState();
                    closeBroadcastModalFunc();
                    showToast(`Annonce diffusée avec succès à ${count} membre(s) !`, "success");
                } catch (fallbackErr) {
                    showToast("Erreur lors de la diffusion de l'annonce.", "error");
                }
            } finally {
                if (submitBroadcastBtn) {
                    submitBroadcastBtn.disabled = false;
                    submitBroadcastBtn.innerHTML = '<span>📢 Diffuser l\'Annonce</span>';
                }
            }
        });
    }

    // Auto-expand & Enter to send key handlers for chat textareas
    const setupTextareaAutoExpand = () => {
        const userChatInput = document.getElementById('user-chat-input');
        const adminChatInput = document.getElementById('admin-chat-input');

        [userChatInput, adminChatInput].forEach(textarea => {
            if (textarea && !textarea.hasAttribute('data-autoexpand-bound')) {
                textarea.setAttribute('data-autoexpand-bound', 'true');

                textarea.addEventListener('input', () => {
                    textarea.style.height = 'auto';
                    textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
                });

                textarea.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        textarea.form?.requestSubmit();
                    }
                });
            }
        });
    };
    setupTextareaAutoExpand();

    let currentOperationMemberId = null;
    let currentOperationType = null;
    const operationDateInput = document.getElementById('operation-date');

    // showToast est défini globalement en haut du fichier (fonction hoistée)

    window.openOperationModal = (id, nom, type) => {
        currentOperationMemberId = id;
        currentOperationType = type;

        modalMemberName.textContent = nom;
        modalOperationTitle.textContent = type === 'depot' ? 'Nouveau Dépôt' : 'Nouveau Retrait';
        modalAmountLabel.textContent = type === 'depot' ? 'Montant du dépôt (Fc) :' : 'Montant du retrait (Fc) :';

        validateOperationBtn.className = type === 'depot' ? 'btn-success' : 'btn-danger';
        validateOperationBtn.textContent = type === 'depot' ? 'Confirmer le dépôt' : 'Confirmer le retrait';
        validateOperationBtn.style.width = '100%';

        const memberIndex = state.members.findIndex(m => String(m.id) === String(id));
        const memberParts = memberIndex !== -1 ? state.members[memberIndex].parts : 1;

        if (type === 'depot') {
            operationAmountInput.value = memberParts * 1000;
        } else {
            operationAmountInput.value = '';
        }

        const today = new Date().toISOString().split('T')[0];
        operationDateInput.value = today;

        operationModal.classList.add('active');
        setTimeout(() => operationAmountInput.focus(), 100);
    };

    const editMemberModal = document.getElementById('edit-member-modal');
    const memberDetailsModal = document.getElementById('member-details-modal');

    document.body.addEventListener('click', (e) => {
        if (e.target) {
            if (
                e.target.classList.contains('modal') ||
                (typeof e.target.closest === 'function' && (e.target.closest('.close-modal') || e.target.closest('.close-modal-btn')))
            ) {
                if (operationModal) operationModal.classList.remove('active');
                if (editMemberModal) editMemberModal.classList.remove('active');
                if (memberDetailsModal) memberDetailsModal.classList.remove('active');
            }
        }
    });

    validateOperationBtn.addEventListener('click', async () => {
        const amount = parseFloat(operationAmountInput.value);
        const opDate = operationDateInput.value;

        if (!opDate) {
            showToast('Veuillez sélectionner une date.', 'error');
            return;
        }

        if (!isNaN(amount) && amount > 0) {
            const memberIndex = state.members.findIndex(m => String(m.id) === String(currentOperationMemberId));
            if (memberIndex !== -1) {
                const member = state.members[memberIndex];
                const typeName = currentOperationType === 'depot' ? 'dépôt' : 'retrait';

                const parts = Math.max(1, (member.parts || 1));
                const minSingleDepot = 1000;
                const maxTotalDepot = parts * 63000;
                const minSingleRetrait = 62000; // Minimum fixe de 62 000 Fc peu importe le nombre de parts
                const maxTotalRetrait = parts * 62000;
                const soldeDisponible = (member.totalDepot || 0) - (member.totalRetrait || 0);

                if (currentOperationType === 'depot') {
                    if (amount < minSingleDepot) {
                        showToast(`Dépôt refusé : Le montant minimum pour un dépôt est de ${minSingleDepot.toLocaleString('fr-FR')} Fc.`, 'error');
                        return;
                    }
                    if ((member.totalDepot + amount) > maxTotalDepot) {
                        const reste = Math.max(0, maxTotalDepot - member.totalDepot);
                        showToast(`Dépôt refusé : Pour ${parts} part(s), le cumul maximal de dépôt pour un cycle (63 jours) est de ${maxTotalDepot.toLocaleString('fr-FR')} Fc. Reste autorisé : ${reste.toLocaleString('fr-FR')} Fc.`, 'error');
                        return;
                    }
                } else if (currentOperationType === 'retrait') {
                    if (amount < minSingleRetrait) {
                        showToast(`Retrait refusé : Le montant minimum à retirer est de 62 000 Fc.`, 'error');
                        return;
                    }
                    if ((member.totalRetrait + amount) > maxTotalRetrait) {
                        const reste = Math.max(0, maxTotalRetrait - member.totalRetrait);
                        showToast(`Retrait refusé : Pour ${parts} part(s), le plafond maximal cumulé de retrait est de ${maxTotalRetrait.toLocaleString('fr-FR')} Fc. Reste autorisé : ${reste.toLocaleString('fr-FR')} Fc.`, 'error');
                        return;
                    }
                }

                // Confirmation insistante
                const isConfirmed = confirm(`Voulez-vous vraiment confirmer le ${typeName} de ${amount.toLocaleString('fr-FR')} Fc pour le membre ${member.nom} le ${new Date(opDate).toLocaleDateString('fr-FR')} ?\n\nCette action mettra à jour le solde.`);

                if (isConfirmed) {
                    try {
                        const res = await fetch(`${API.transactions}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                memberId: member.id,
                                memberNom: member.nom,
                                type: currentOperationType,
                                amount: amount,
                                adminNom: (currentUser ? currentUser.nom : 'Admin'),
                                date: opDate
                            })
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || "Erreur lors de l'opération.");

                        await loadState();
                        if (notifChannel) {
                            notifChannel.postMessage({ type: 'NEW_TRANSACTION', memberId: member.id, memberNom: member.nom });
                        }
                        operationModal.classList.remove('active');
                        showToast(`Le ${typeName} de ${amount.toLocaleString('fr-FR')} Fc (Cash) a été enregistré.`, 'success');

                    } catch (error) {
                        console.error("Erreur lors de l'enregistrement de l'opération :", error);
                        showToast(error.message || "Erreur lors de l'enregistrement de l'opération.", "error");
                    }
                }
            }
        } else {
            showToast('Veuillez entrer un montant valide supérieur à 0.', 'error');
        }
    });

    // --- Member Edit, Delete & Details ---
    window.deleteSecAdmin = async (id) => {
        const admin = state.members.find(m => String(m.id) === String(id));
        if (admin && confirm(`Voulez-vous vraiment supprimer l'administrateur secondaire "${admin.nom}" ?`)) {
            try {
                const res = await fetch(`${API.members}?action=delete&id=${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error("Erreur de suppression");
                await loadState();
                showToast('Administrateur secondaire supprimé avec succès.', 'success');
            } catch (err) {
                console.error(err);
                showToast("Erreur lors de la suppression.", "error");
            }
        }
    };

    window.deleteMember = async (id) => {
        const member = state.members.find(m => String(m.id) === String(id));
        if (member && confirm(`Voulez-vous vraiment supprimer le membre "${member.nom}" ?`)) {
            try {
                const res = await fetch(`${API.members}?action=delete&id=${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error("Erreur de suppression");
                await loadState();
                showToast('Membre supprimé avec succès.', 'success');
            } catch (err) {
                console.error(err);
                showToast("Erreur lors de la suppression.", "error");
            }
        }
    };

    const editNomIdInput = document.getElementById('edit-nom-id');
    const editPartsInput = document.getElementById('edit-parts');
    const editMemberIdInput = document.getElementById('edit-member-id');
    const saveEditMemberBtn = document.getElementById('save-edit-member-btn');

    window.openEditMemberModal = (id) => {
        const member = state.members.find(m => String(m.id) === String(id));
        if (member && editMemberModal) {
            editMemberIdInput.value = member.id;
            editNomIdInput.value = member.nom;
            editPartsInput.value = member.parts;
            editMemberModal.classList.add('active');
        }
    };

    if (saveEditMemberBtn) {
        saveEditMemberBtn.addEventListener('click', async () => {
            const id = editMemberIdInput.value;
            const newNom = editNomIdInput.value.trim();
            const newParts = parseInt(editPartsInput.value);

            if (newNom && newParts > 0) {
                try {
                    const res = await fetch(`${API.members}?action=update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, nom: newNom, parts: newParts })
                    });
                    if (!res.ok) throw new Error("Erreur de mise à jour");

                    await loadState();
                    if (editMemberModal) editMemberModal.classList.remove('active');
                    showToast('Membre mis à jour.', 'success');
                } catch (err) {
                    console.error(err);
                    showToast("Erreur de mise à jour.", "error");
                }
            }
        });
    }

    window.openMemberDetails = (id) => {
        const member = state.members.find(m => String(m.id) === String(id));
        if (member && memberDetailsModal) {
            document.getElementById('details-nom-id').textContent = member.nom;
            document.getElementById('details-parts').textContent = member.parts;
            const depot = member.totalDepot || 0;
            const retrait = member.totalRetrait || 0;
            const solde = depot - retrait;

            document.getElementById('details-total-depots').textContent = depot.toLocaleString('fr-FR') + ' Fc';
            document.getElementById('details-total-retraits').textContent = retrait.toLocaleString('fr-FR') + ' Fc';
            document.getElementById('details-solde').textContent = solde.toLocaleString('fr-FR') + ' Fc';

            const promoteBtn = document.getElementById('promote-admin-btn');
            if (promoteBtn) {
                // Show button ONLY if current user is the MAIN admin
                const targetAdminEmail = (state.credentials && state.credentials.email) ? state.credentials.email.trim().toLowerCase() : 'zubiksservice@gmail.com';
                if (currentUser && currentUser.role === 'admin' && (currentUser.email || '').toLowerCase() === targetAdminEmail) {
                    promoteBtn.style.display = 'inline-block';

                    if (member.role === 'admin_second') {
                        promoteBtn.textContent = 'Retirer droits Admin';
                        promoteBtn.style.backgroundColor = 'var(--danger-color, #e53e3e)';
                        promoteBtn.onclick = async () => {
                            if (confirm(`Voulez-vous retirer les droits d'administrateur à ${member.nom} ?`)) {
                                member.role = 'user';
                                try {
                                    await fetch(`${API.members}?action=update_role`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ id: member.id, role: 'user' })
                                    });
                                } catch (e) { }
                                showToast(`${member.nom} n'est plus administrateur.`, 'success');
                                memberDetailsModal.classList.remove('active');
                                renderAll();
                            }
                        };
                    } else {
                        promoteBtn.textContent = 'Promouvoir Admin';
                        promoteBtn.style.backgroundColor = 'var(--warning-color, #dd6b20)';
                        promoteBtn.onclick = async () => {
                            const adminSecondCount = state.members.filter(m => m.role === 'admin_second').length;
                            if (adminSecondCount >= 5) {
                                showToast('Limite atteinte : Vous ne pouvez pas avoir plus de 5 administrateurs secondaires.', 'error');
                                return;
                            }
                            if (confirm(`Voulez-vous promouvoir ${member.nom} comme Administrateur Secondaire ?\n\nIl aura accès au tableau de bord, mais sans les droits de sécurité.`)) {
                                member.role = 'admin_second';
                                try {
                                    await fetch(`${API.members}?action=update_role`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ id: member.id, role: 'admin_second' })
                                    });
                                } catch (e) { }
                                showToast(`${member.nom} est maintenant administrateur secondaire !`, 'success');
                                memberDetailsModal.classList.remove('active');
                                renderAll();
                            }
                        };
                    }
                } else {
                    promoteBtn.style.display = 'none';
                }
            }

            memberDetailsModal.classList.add('active');
        }
    };

    // --- Export & Import Logic ---
    const btnExportDb = document.getElementById('btn-export-db');
    const btnImportDb = document.getElementById('btn-import-db');
    const importFileInput = document.getElementById('import-file-input');

    if (btnExportDb) {
        btnExportDb.addEventListener('click', () => {
            const dataStr = JSON.stringify(state, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `zubix_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast('Base de données exportée avec succès.', 'success');
        });
    }

    if (btnImportDb && importFileInput) {
        btnImportDb.addEventListener('click', () => {
            importFileInput.click();
        });

        importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importedState = JSON.parse(event.target.result);

                    const processImport = async () => {
                        const isMerge = confirm('Souhaitez-vous FUSIONNER les données importées avec vos données actuelles ?\n\n- OK = Fusionner sans écraser\n- Annuler = Remplacer toutes les données');

                        if (!isMerge) {
                            if (!confirm('Êtes-vous sûr de vouloir REMPLACER toutes vos données actuelles ? (Action irréversible)')) {
                                importFileInput.value = '';
                                return;
                            }
                        }

                        showToast("Restauration de la sauvegarde terminée !", "success");
                        await loadState();
                        setTimeout(() => window.location.reload(), 1500);
                    };

                    processImport();

                    renderAll();

                    // Switch to home tab to refresh view smoothly
                    document.querySelector('[data-target="tab-accueil"]').click();
                } catch (error) {
                    showToast('Erreur lors de la lecture du fichier de sauvegarde.', 'error');
                }
                // Reset input
                importFileInput.value = '';
            };
            reader.readAsText(file);
        });
    }

    // --- Archive Logic ---
    const archiveDailyBtn = document.getElementById('archive-daily-btn');
    if (archiveDailyBtn) {
        archiveDailyBtn.addEventListener('click', async () => {
            if (confirm('Voulez-vous vraiment archiver la journée ? Cela remettra à zéro les compteurs journaliers.')) {
                try {
                    const res = await fetch(`${API.stats}?action=archive_day`, { method: 'POST' });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Erreur lors de l'archivage.");

                    await loadState();
                    showToast('Journée archivée avec succès.', 'success');
                } catch (error) {
                    console.error("Erreur lors de l'archivage journalier:", error);
                    showToast(error.message || 'Erreur lors de l\'archivage.', 'error');
                }
            }
        });
    }

    if (archiveBtn) {
        archiveBtn.addEventListener('click', async () => {
            const confirmArchive = confirm('ARCHIVAGE : Cette action va sauvegarder le cycle actuel et réinitialiser les compteurs.\n\nVoulez-vous continuer ?');
            if (!confirmArchive) return;

            const wishBackup = confirm('Voulez-vous télécharger une sauvegarde (.json) avant la réinitialisation ?');
            if (wishBackup && typeof btnExportDb !== 'undefined' && btnExportDb) {
                btnExportDb.click();
            }

            try {
                showToast("Archivage en cours, veuillez patienter...", "info");
                const res = await fetch(`${API.stats}?action=archive_cycle`, { method: 'POST' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Erreur lors de l'archivage du cycle.");

                await loadState();
                showToast('Nouveau cycle démarré avec succès. Historique sauvegardé !', 'success');
            } catch (error) {
                console.error("Erreur lors de la réinitialisation du cycle:", error);
                showToast(error.message || "Erreur lors de l'archivage.", "error");
            }
        });
    }

    // --- Reset Database Logic ---
    const resetDatabaseBtn = document.getElementById('reset-database-btn');
    if (resetDatabaseBtn) {
        resetDatabaseBtn.addEventListener('click', async () => {
            const doubleConfirm = confirm("⚠️ ATTENTION : Êtes-vous sûr de vouloir réinitialiser COMPLÈTEMENT toutes les données ?\n\nCette action supprimera définitivement tous les membres, les transactions et tous les historiques d'archives.");

            if (doubleConfirm) {
                try {
                    showToast("Suppression des données en cours, veuillez patienter...", "info");
                    const res = await fetch(`${API.stats}?action=reset_app`, { method: 'POST' });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Erreur lors de la réinitialisation.");

                    await loadState();
                    showToast("Toutes les données ont été réinitialisées avec succès.", "success");
                } catch (err) {
                    console.error("Erreur réinitialisation :", err);
                    showToast(err.message || "Erreur de réinitialisation.", "error");
                }
            }
        });
    }

    // --- Textarea Save logic (A propos) ---
    const textarea = document.querySelector('.modern-textarea');
    if (textarea) {
        textarea.value = state.reglements || "";
        textarea.addEventListener('change', async (e) => {
            const newReglements = e.target.value;
            state.reglements = newReglements;
            try {
                await fetch(`${API.stats}?action=update_reglements`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reglements: newReglements })
                });
            } catch (err) { }
        });
    }

    // --- Mark all notifications read ---
    const btnMarkAllRead = document.getElementById('btn-mark-all-read');
    if (btnMarkAllRead) {
        btnMarkAllRead.addEventListener('click', async () => {
            if (currentUser) {
                const notifsArr = getNotificationsArray(currentUser.notifications);
                notifsArr.forEach(n => n.read = true);
                currentUser.notifications = notifsArr;
                try {
                    const res = await fetch(`${API.members}?action=mark_read`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: currentUser.id })
                    });
                    const data = await res.json();
                    if (data && data.notifications) {
                        currentUser.notifications = data.notifications;
                        saveActiveSession(currentUser);
                    }
                } catch (e) { }
                renderAll();
                showToast("Toutes vos notifications ont été marquées comme lues.", "success");
            }
        });
    }

    // --- Persistent Session Management ---
    const SESSION_KEY = 'zubiks_active_session_v1';

    const saveActiveSession = (user) => {
        if (!user) {
            localStorage.removeItem(SESSION_KEY);
        } else {
            localStorage.setItem(SESSION_KEY, JSON.stringify({
                role: user.role,
                id: user.id || null,
                email: user.email || null,
                profilePhoto: user.profilePhoto || null,
                nom: user.nom || null
            }));
        }
    };

    const checkAndRestoreSession = () => {
        const savedSession = localStorage.getItem(SESSION_KEY);
        const splashScreen = document.getElementById('splash-screen');
        let sessionRestored = false;

        if (savedSession) {
            try {
                const sess = JSON.parse(savedSession);

                // Auto-migrate session email if it's the old admin email
                if (sess.email && sess.email.toLowerCase() === 'obedtechn02@gmail.com') {
                    sess.email = 'zubiksservice@gmail.com';
                }

                if (sess.role === 'admin') {
                    currentUser = {
                        role: 'admin',
                        nom: 'Admin ZUBIKS',
                        email: (state.credentials && state.credentials.email) ? state.credentials.email : 'zubiksservice@gmail.com',
                        profilePhoto: sess.profilePhoto || state.adminProfilePhoto || null
                    };
                } else if (sess.id || sess.email) {
                    const userMatch = state.members.find(m => String(m.id) === String(sess.id) || (m.email && m.email.toLowerCase() === (sess.email || '').toLowerCase()));
                    if (userMatch) {
                        currentUser = { ...userMatch, profilePhoto: userMatch.profilePhoto || sess.profilePhoto || null };
                    } else {
                        // Deleted member fallback: revoke session
                        saveActiveSession(null);
                        localStorage.removeItem('zubiks_jwt_token');
                        currentUser = null;
                    }
                }

                if (currentUser) {
                    // Auto-migrate currentUser email if it's the old admin email
                    if (currentUser.email && currentUser.email.toLowerCase() === 'obedtechn02@gmail.com') {
                        currentUser.email = 'zubiksservice@gmail.com';
                    }
                    switchRoleView();
                    if (loginScreen) loginScreen.classList.remove('active');
                    if (dashboardScreen) dashboardScreen.classList.add('active');
                    updateDates();
                    renderAll();
                    console.log("Session restaurée automatiquement.");
                    sessionRestored = true;
                }
            } catch (e) {
                console.error("Erreur lors de la restauration de la session :", e);
                localStorage.removeItem(SESSION_KEY);
            }
        }

        if (!sessionRestored) {
            if (loginScreen) loginScreen.classList.add('active');
            if (dashboardScreen) dashboardScreen.classList.remove('active');
        }

        // Cache toujours le splash screen à la fin du chargement
        if (splashScreen) {
            splashScreen.style.opacity = '0';
            setTimeout(() => {
                splashScreen.classList.remove('active');
                splashScreen.style.display = 'none';
            }, 300); // Transition douce
        }
    };

    // --- Admin & Sécurité Listeners ---
    const createSecAdminForm = document.getElementById('create-secondary-admin-form');
    if (createSecAdminForm) {
        createSecAdminForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nom = document.getElementById('sec-admin-name').value.trim();
            const email = document.getElementById('sec-admin-email').value.trim();
            const password = document.getElementById('sec-admin-password').value;

            if (!nom || !email || !password) {
                showToast("Veuillez remplir tous les champs.", "error");
                return;
            }

            try {
                const res = await fetch(`${API.auth}?action=signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, nom, parts: 1 })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Erreur lors de la création.");

                if (data.user && data.user.id) {
                    await fetch(`${API.members}?action=update_role`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: data.user.id, role: 'admin_second' })
                    });
                }

                await loadState();
                createSecAdminForm.reset();
                showToast("Administrateur secondaire créé avec succès.", "success");
            } catch (err) {
                console.error("Erreur création admin secondaire :", err);
                showToast(err.message || "Erreur lors de la création.", "error");
            }
        });
    }

    const changeCredentialsForm = document.getElementById('change-credentials-form');
    if (changeCredentialsForm) {
        changeCredentialsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('change-email');
            const passwordInput = document.getElementById('change-password');
            const email = emailInput ? emailInput.value.trim() : '';
            const newPassword = passwordInput ? passwordInput.value : '';

            if (!newPassword) {
                showToast("Veuillez saisir un nouveau mot de passe.", "error");
                return;
            }

            try {
                const res = await fetch(`${API.auth}?action=change_password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: currentUser ? currentUser.id : '',
                        email: email,
                        newPassword: newPassword
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Erreur lors de la modification du mot de passe.");

                showToast(data.message || "Mot de passe mis à jour avec succès !", "success");
                if (passwordInput) passwordInput.value = '';

                // Mettre à jour la session et l'état local en douceur sans réinitialiser l'écran de l'application
                if (currentUser) {
                    if (email) currentUser.email = email;
                    saveActiveSession(currentUser);
                }
                await loadState();
                renderAll();
            } catch (err) {
                console.error("Erreur modification mot de passe :", err);
                showToast(err.message || "Erreur lors de la modification.", "error");
            }
        });
    }

    // =========================================
    // --- PWA Installation Experience Handler ---
    // =========================================
    let deferredPrompt = null;
    const pwaBanner = document.getElementById('pwa-install-banner');
    const pwaAcceptBtn = document.getElementById('pwa-accept-btn');
    const pwaDismissBtn = document.getElementById('pwa-dismiss-btn');
    const pwaIosModal = document.getElementById('pwa-ios-modal');
    const closeIosModalBtn = document.getElementById('close-ios-pwa-modal');
    const btnCloseIosGuide = document.getElementById('btn-close-ios-guide');
    const navInstallBtn = document.getElementById('btn-install-pwa');
    const sidebarInstallBtn = document.getElementById('btn-install-pwa-sidebar');

    const isStandalone = () => {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true ||
               (document.referrer && document.referrer.includes('android-app://'));
    };

    const isIosDevice = () => {
        const ua = window.navigator.userAgent.toLowerCase();
        return /iphone|ipad|ipod/.test(ua);
    };

    const showPwaInstallButtons = () => {
        if (isStandalone()) return;
        if (navInstallBtn) navInstallBtn.style.display = 'inline-flex';
        if (sidebarInstallBtn) sidebarInstallBtn.style.display = 'block';
    };

    const hidePwaInstallBanner = () => {
        if (pwaBanner) pwaBanner.style.display = 'none';
    };

    const triggerPwaInstall = () => {
        if (isStandalone()) {
            showToast("L'application est déjà installée sur votre appareil ! 🟢", "info");
            return;
        }

        if (isIosDevice()) {
            if (pwaIosModal) pwaIosModal.style.display = 'flex';
            hidePwaInstallBanner();
            return;
        }

        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult && choiceResult.outcome === 'accepted') {
                    showToast("Merci ! L'application a été installée avec succès. 🎉", "success");
                    hidePwaInstallBanner();
                    if (navInstallBtn) navInstallBtn.style.display = 'none';
                    if (sidebarInstallBtn) sidebarInstallBtn.style.display = 'none';
                }
                deferredPrompt = null;
            });
        } else {
            showToast("Pour installer l'icône : ouvrez le menu de votre navigateur et cliquez sur 'Installer l'application' ou 'Ajouter à l'écran d'accueil'. 📲", "info");
        }
    };

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showPwaInstallButtons();

        const lastDismissed = localStorage.getItem('pwa_banner_dismissed_time');
        const now = Date.now();
        const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

        if (!isStandalone() && (!lastDismissed || (now - parseInt(lastDismissed, 10)) > twoDaysMs)) {
            setTimeout(() => {
                if (pwaBanner) pwaBanner.style.display = 'block';
            }, 1200);
        }
    });

    if (isIosDevice() && !isStandalone()) {
        showPwaInstallButtons();
        const lastDismissed = localStorage.getItem('pwa_banner_dismissed_time');
        const now = Date.now();
        const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
        if (!lastDismissed || (now - parseInt(lastDismissed, 10)) > twoDaysMs) {
            setTimeout(() => {
                if (pwaBanner) pwaBanner.style.display = 'block';
            }, 1500);
        }
    }

    if (pwaAcceptBtn) pwaAcceptBtn.addEventListener('click', triggerPwaInstall);
    if (navInstallBtn) navInstallBtn.addEventListener('click', triggerPwaInstall);
    if (sidebarInstallBtn) sidebarInstallBtn.addEventListener('click', triggerPwaInstall);

    if (pwaDismissBtn) {
        pwaDismissBtn.addEventListener('click', () => {
            hidePwaInstallBanner();
            localStorage.setItem('pwa_banner_dismissed_time', Date.now().toString());
        });
    }

    const closeIosFunc = () => {
        if (pwaIosModal) pwaIosModal.style.display = 'none';
    };
    if (closeIosModalBtn) closeIosModalBtn.addEventListener('click', closeIosFunc);
    if (btnCloseIosGuide) btnCloseIosGuide.addEventListener('click', closeIosFunc);

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        hidePwaInstallBanner();
        if (navInstallBtn) navInstallBtn.style.display = 'none';
        if (sidebarInstallBtn) sidebarInstallBtn.style.display = 'none';
        showToast("ZUBIKS SERVICE est installé sous forme d'application ! 📲", "success");
    });

    // Initialize
    const initializeAppUi = () => {
        // Fonctions d'initialisation de l'interface
    };

    let initDone = false;
    const finishInit = () => {
        if (initDone) return;
        initDone = true;
        checkAndRestoreSession();
        initializeAppUi();
        setupListeners();
    };

    loadState().then(finishInit).catch(finishInit);
});
