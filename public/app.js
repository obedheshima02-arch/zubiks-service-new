document.addEventListener('DOMContentLoaded', () => {
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
            email: 'zubiksservice@gmail.com',
            password: 'Zubiks@2000'
        }
    };

    // Load State
    const loadState = async () => {
        // Fallback local storage parsing
        const loadFromLocal = () => {
            const savedState = localStorage.getItem('zubiksStateV2') || localStorage.getItem('zubixStateV2');
            if (savedState) {
                try {
                    const parsed = JSON.parse(savedState);
                    // Migration
                    state = {
                        ...state,
                        ...parsed,
                        dailyDepots: parsed.dailyDepots !== undefined ? parsed.dailyDepots : (parsed.dailyTotal || 0),
                        cycleDepots: parsed.cycleDepots !== undefined ? parsed.cycleDepots : (parsed.cycleTotal || 0),
                        dailyRetraits: parsed.dailyRetraits || 0,
                        cycleRetraits: parsed.cycleRetraits || 0,
                    };
                    state.members = (parsed.members || []).map(m => ({
                        ...m,
                        totalDepot: m.totalDepot !== undefined ? m.totalDepot : (m.totalPaye || 0),
                        totalRetrait: m.totalRetrait || 0
                    }));
                    state.archives = parsed.archives || [];
                    state.dailyArchives = parsed.dailyArchives || [];
                    state.transactions = parsed.transactions || [];
                    state.deletedMembers = parsed.deletedMembers || [];
                    state.messages = parsed.messages || [];
                    state.argentDebut = parsed.argentDebut !== undefined ? parsed.argentDebut : 0;
                    state.credentials = parsed.credentials || {
                        email: 'zubiksservice@gmail.com',
                        password: 'Zubiks@2000'
                    };

                    // Auto-migrate stale admin email
                    if (state.credentials && state.credentials.email && state.credentials.email.toLowerCase() === 'obedtechn02@gmail.com') {
                        state.credentials.email = 'zubiksservice@gmail.com';
                    }

                    // Populate change credentials email
                    const changeEmailInput = document.getElementById('change-email');
                    if (changeEmailInput && state.credentials && state.credentials.email) {
                        changeEmailInput.value = state.credentials.email;
                    }
                } catch (error) {
                    console.error("Erreur lors du chargement des données locales :", error);
                }
            }
        };

        try {
            // Fetch from dynamic backend API
            const response = await fetch('/api/state');
            if (!response.ok) throw new Error("HTTP error " + response.status);
            const parsed = await response.json();
            
            let serverHasData = (parsed.members && parsed.members.length > 0) || (parsed.transactions && parsed.transactions.length > 0);
            
            if (!serverHasData) {
                // Serveur retourné vierge : vérifier si localStorage contient des données à restaurer/synchroniser
                const savedState = localStorage.getItem('zubiksStateV2') || localStorage.getItem('zubixStateV2');
                if (savedState) {
                    console.log("Base de données serveur vide, restauration des données du stockage local.");
                    loadFromLocal();
                    saveState(); // Synchroniser les données locales vers le serveur
                    renderAll();
                    return;
                }
            }

            state = {
                ...state,
                ...parsed,
            };
            state.members = (parsed.members || []).map(m => ({
                ...m,
                totalDepot: m.totalDepot !== undefined ? m.totalDepot : 0,
                totalRetrait: m.totalRetrait || 0
            }));
            state.archives = parsed.archives || [];
            state.dailyArchives = parsed.dailyArchives || [];
            state.transactions = parsed.transactions || [];
            state.deletedMembers = parsed.deletedMembers || [];
            state.messages = parsed.messages || [];
            state.argentDebut = parsed.argentDebut !== undefined ? parsed.argentDebut : 0;
            state.credentials = parsed.credentials || {
                email: 'zubiksservice@gmail.com',
                password: 'Zubiks@2000'
            };

            // Auto-migrate stale admin email
            if (state.credentials && state.credentials.email && state.credentials.email.toLowerCase() === 'obedtechn02@gmail.com') {
                state.credentials.email = 'zubiksservice@gmail.com';
            }

            console.log("Données chargées depuis le serveur dynamique.");
            // Render rules in rules textarea if present
            const textarea = document.querySelector('.modern-textarea');
            if (textarea) textarea.value = state.reglements || "";

            // Populate change credentials email
            const changeEmailInput = document.getElementById('change-email');
            if (changeEmailInput && state.credentials && state.credentials.email) {
                changeEmailInput.value = state.credentials.email;
            }
            
            renderAll();
        } catch (err) {
            console.warn("Impossible de joindre le serveur dynamique (utilisation du stockage local) :", err);
            loadFromLocal();
            renderAll();
        }
    };

    // Save State
    const saveState = async () => {
        // Save to local storage first (instant client feedback / fallback)
        localStorage.setItem('zubiksStateV2', JSON.stringify(state));

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (currentJwtToken) {
                headers['Authorization'] = `Bearer ${currentJwtToken}`;
            }

            // Save to dynamic backend API
            const response = await fetch('/api/state', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(state)
            });
            if (!response.ok) throw new Error("HTTP error " + response.status);
            console.log("Données sauvegardées sur le serveur dynamique.");
        } catch (err) {
            console.error("Erreur de sauvegarde sur le serveur dynamique (données conservées localement) :", err);
        }
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

    if (btnShowLogin && btnShowRegister) {
        btnShowLogin.addEventListener('click', () => {
            btnShowLogin.classList.add('active');
            btnShowLogin.style.background = 'white';
            btnShowLogin.style.color = 'var(--primary-color)';
            btnShowLogin.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

            btnShowRegister.classList.remove('active');
            btnShowRegister.style.background = 'transparent';
            btnShowRegister.style.color = 'var(--text-muted)';
            btnShowRegister.style.boxShadow = 'none';

            loginFormWrapper.style.display = 'block';
            registerFormWrapper.style.display = 'none';
        });

        btnShowRegister.addEventListener('click', () => {
            btnShowRegister.classList.add('active');
            btnShowRegister.style.background = 'white';
            btnShowRegister.style.color = 'var(--primary-color)';
            btnShowRegister.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

            btnShowLogin.classList.remove('active');
            btnShowLogin.style.background = 'transparent';
            btnShowLogin.style.color = 'var(--text-muted)';
            btnShowLogin.style.boxShadow = 'none';

            registerFormWrapper.style.display = 'block';
            loginFormWrapper.style.display = 'none';
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

    // Formulaire d'inscription Utilisateur
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
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nom, postnom, sexe, email, password })
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                    showToast(data.error || "Erreur lors de l'inscription.", "error");
                    return;
                }

                await loadState();
                registerForm.reset();
                showToast("Création de compte réussie avec succès ! Votre compte est en attente de la validation de vos parts par l'administrateur.", "success");
                if (btnShowLogin) btnShowLogin.click();
                
                const loginEmailInput = document.getElementById('email');
                const loginPasswordInput = document.getElementById('password');
                if (loginEmailInput) loginEmailInput.value = email;
                if (loginPasswordInput) setTimeout(() => loginPasswordInput.focus(), 150);
            } catch (err) {
                console.error("Erreur inscription API, fallback local :", err);
                const lowerEmail = email.toLowerCase();
                const targetAdminEmail = (state.credentials && state.credentials.email) ? state.credentials.email.toLowerCase() : 'zubiksservice@gmail.com';
                const existing = state.members.find(m => (m.email || '').toLowerCase() === lowerEmail);

                if (existing || lowerEmail === targetAdminEmail) {
                    showToast("Cette adresse email est déjà enregistrée.", "error");
                    return;
                }

                const fullName = `${nom} ${postnom}`.trim();
                const newUser = {
                    id: Date.now().toString(),
                    nom: fullName,
                    postnom: postnom,
                    sexe: sexe,
                    email: lowerEmail,
                    password: password,
                    role: 'user',
                    status: 'pending',
                    parts: 0,
                    totalDepot: 0,
                    totalRetrait: 0,
                    dateAjout: new Date().toISOString(),
                    notifications: [{ id: Date.now().toString(), message: "Bienvenue sur ZUBIX SERVICE !", date: new Date().toISOString(), read: false }]
                };
                state.members.push(newUser);
                saveState();
                renderAll();
                registerForm.reset();
                showToast("Création de compte réussie avec succès !", "success");
                if (btnShowLogin) btnShowLogin.click();
                
                const loginEmailInput = document.getElementById('email');
                const loginPasswordInput = document.getElementById('password');
                if (loginEmailInput) loginEmailInput.value = email;
                if (loginPasswordInput) setTimeout(() => loginPasswordInput.focus(), 150);
            }
        });
    }

    // Formulaire de Connexion
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                showToast(data.error || 'Email ou mot de passe incorrect.', 'error');
                return;
            }

            currentJwtToken = data.token;
            localStorage.setItem('zubiks_jwt_token', data.token);

            currentUser = data.user;
            saveActiveSession(currentUser);

            await loadState();

            switchRoleView();
            loginScreen.classList.remove('active');
            dashboardScreen.classList.add('active');
            updateDates();
            renderAll();
            showToast(`Connexion réussie (${currentUser.role === 'admin' ? 'Administrateur' : currentUser.nom})`, 'success');
        } catch (err) {
            console.error("Erreur de connexion serveur, fallback local :", err);

            // Check if email belongs to a deleted account
            const isDeletedLocal = (state.deletedMembers || []).some(d => (d.email || '').toLowerCase() === email);
            if (isDeletedLocal) {
                showToast('Votre compte a été supprimé par l\'administrateur.', 'error');
                return;
            }

            const targetAdminEmail = (state.credentials && state.credentials.email) ? state.credentials.email.toLowerCase() : 'zubiksservice@gmail.com';
            const targetAdminPassword = (state.credentials && state.credentials.password) ? state.credentials.password : 'Zubiks@2000';

            if (email === targetAdminEmail) {
                if (password === targetAdminPassword) {
                    currentUser = { role: 'admin', nom: 'Admin ZUBIKS', email: targetAdminEmail };
                    saveActiveSession(currentUser);
                    switchRoleView();
                    loginScreen.classList.remove('active');
                    dashboardScreen.classList.add('active');
                    updateDates();
                    renderAll();
                    showToast('Connexion Administrateur réussie', 'success');
                } else {
                    showToast('Email ou mot de passe incorrect.', 'error');
                }
                return;
            }

            const userMatch = state.members.find(m => (m.email || '').toLowerCase() === email && m.password === password);
            if (userMatch) {
                currentUser = userMatch;
                saveActiveSession(currentUser);
                switchRoleView();
                loginScreen.classList.remove('active');
                dashboardScreen.classList.add('active');
                updateDates();
                renderAll();
                showToast(`Bienvenue, ${userMatch.nom}`, 'success');
                return;
            }

            showToast('Email ou mot de passe incorrect.', 'error');
        }
    });

    const updateHeaderAvatar = (user) => {
        const loggedUserAvatar = document.getElementById('logged-user-avatar');
        if (!loggedUserAvatar) return;
        const initials = (user && user.nom ? user.nom : 'Admin').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        loggedUserAvatar.textContent = initials;
    };

    const switchRoleView = () => {
        const adminNavGroup = document.getElementById('admin-nav-group');
        const userNavGroup = document.getElementById('user-nav-group');
        const userRoleBadge = document.getElementById('user-role-badge');
        const loggedUserName = document.getElementById('logged-user-name');

        const securityPanelAdmin = document.getElementById('security-panel-admin');
        const backupPanelAdmin = document.getElementById('backup-panel-admin');

        if (currentUser && currentUser.role === 'admin') {
            if (adminNavGroup) adminNavGroup.style.display = 'flex';
            if (userNavGroup) userNavGroup.style.display = 'none';
            
            if (userRoleBadge) {
                userRoleBadge.textContent = "Administrateur";
                userRoleBadge.style.background = "var(--primary-color)";
            }
            if (loggedUserName) loggedUserName.textContent = "Admin ZUBIKS";
            updateHeaderAvatar(currentUser);

            if (securityPanelAdmin) securityPanelAdmin.style.display = 'block';
            if (backupPanelAdmin) backupPanelAdmin.style.display = 'block';

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

    const performLogout = (msg = 'Vous êtes déconnecté.') => {
        currentUser = null;
        currentJwtToken = null;
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
        btn.addEventListener('click', () => {
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

            // Fermer le tiroir mobile après sélection
            closeSidebarMobile();
        });
    });

    // Add search event listeners
    if (searchMemberInput) searchMemberInput.addEventListener('input', () => renderAll());
    if (searchDepotInput) searchDepotInput.addEventListener('input', () => renderAll());
    if (searchRetraitInput) searchRetraitInput.addEventListener('input', () => renderAll());
    if (searchTransactionInput) searchTransactionInput.addEventListener('input', () => renderAll());
    if (filterTransactionDate) filterTransactionDate.addEventListener('change', () => renderAll());

    // --- Members Logic ---
    const formatDate = (dateString) => {
        const d = new Date(dateString);
        return d.toLocaleDateString('fr-FR');
    };

    addMemberForm.addEventListener('submit', (e) => {
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

            const newMember = {
                id: Date.now().toString(),
                nom: nom,
                parts: parts,
                totalDepot: 0,
                totalRetrait: 0,
                dateAjout: new Date().toISOString()
            };
            state.members.push(newMember);
            saveState();
            renderAll();
            addMemberForm.reset();
            showToast('Nouveau membre ajouté avec succès.', 'success');
        }
    });



    // --- Rendering Logic ---
    window.validateMemberParts = (id) => {
        const input = document.getElementById(`pending-parts-${id}`);
        if (!input) return;

        const parts = parseInt(input.value);
        if (isNaN(parts) || parts < 1) {
            showToast("Veuillez saisir un nombre de parts valide (minimum 1).", "error");
            return;
        }

        const member = state.members.find(m => String(m.id) === String(id));
        if (member) {
            member.parts = parts;
            member.status = 'active';

            if (!member.notifications) member.notifications = [];
            member.notifications.push({
                id: Date.now().toString(),
                message: `🎉 Votre compte a été validé par l'administrateur avec ${parts} part(s) attribuée(s). Vous pouvez désormais effectuer vos opérations cash !`,
                date: new Date().toISOString(),
                read: false
            });

            saveState();
            renderAll();
            showToast(`Compte de "${member.nom}" validé avec ${parts} part(s).`, "success");
        }
    };

    const renderAll = () => {
        const memberSearchTerm = (searchMemberInput ? searchMemberInput.value.toLowerCase() : '');
        const depotSearchTerm = (searchDepotInput ? searchDepotInput.value.toLowerCase() : '');
        const retraitSearchTerm = (searchRetraitInput ? searchRetraitInput.value.toLowerCase() : '');
        const transactionSearchTerm = (searchTransactionInput ? searchTransactionInput.value.toLowerCase() : '');
        const transactionFilterDate = (filterTransactionDate ? filterTransactionDate.value : '');

        // 1. Render Pending Registrations (Admin View)
        const pendingMembers = state.members.filter(m => m.status === 'pending');
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

        // Active members list
        const activeMembers = state.members.filter(m => m.status !== 'pending');

        // Sort active members alphabetically
        const sortedMembers = [...activeMembers].sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));

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

        // Render Transactions Table
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

            if (filteredTx.length > 0) {
                const reversedTransactions = [...filteredTx].reverse();
                reversedTransactions.forEach((tx, index) => {
                    const isDepot = tx.type === 'depot';
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${reversedTransactions.length - index}</td>
                        <td>${new Date(tx.date).toLocaleDateString('fr-FR')}</td>
                        <td class="text-muted">${new Date(tx.timestamp).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</td>
                        <td><span class="btn-action ${isDepot ? 'btn-success' : 'btn-danger'}" style="background-color:var(--${isDepot ? 'success' : 'danger'}); padding: 3px 8px; font-size: 0.75rem;">${isDepot ? 'Dépôt Cash' : 'Retrait Cash'}</span></td>
                        <td><strong>${tx.memberNom}</strong></td>
                        <td><span class="${isDepot ? 'text-success' : 'text-danger'}"><strong>${isDepot ? '+' : '-'}${tx.amount.toLocaleString('fr-FR')} Fc</strong></span></td>
                    `;
                    transactionsTableBody.appendChild(tr);
                });
            } else {
                transactionsTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding: 20px;">Aucune transaction correspondante.</td></tr>';
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
                            <td class="text-muted">${new Date(tx.timestamp).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</td>
                            <td><span class="btn-action ${isDepot ? 'btn-success' : 'btn-danger'}" style="background-color:var(--${isDepot ? 'success' : 'danger'}); padding: 3px 8px; font-size: 0.75rem;">${isDepot ? 'Dépôt Cash' : 'Retrait Cash'}</span></td>
                            <td><span class="${isDepot ? 'text-success' : 'text-danger'}"><strong>${isDepot ? '+' : '-'}${tx.amount.toLocaleString('fr-FR')} Fc</strong></span></td>
                        `;
                        userTxTableBody.appendChild(tr);
                    });
                } else {
                    userTxTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding: 20px;">Aucune transaction enregistrée pour votre compte.</td></tr>';
                }
            }

            // User Notifications
            const userNotifList = document.getElementById('user-notifications-list');
            const unreadBadge = document.getElementById('unread-notif-badge');
            
            const notifs = currentUser.notifications || [];
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
                                <small class="text-muted">${new Date(n.date).toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}</small>
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
            const userMsgs = (state.messages || []).filter(m => String(m.memberId) === String(currentUser.id));
            
            // Mark received admin messages as read when user views messaging tab
            const activeTab = document.querySelector('.tab-pane.active');
            if (activeTab && activeTab.id === 'tab-messagerie-user') {
                let updated = false;
                userMsgs.forEach(m => {
                    if (m.sender === 'admin' && !m.readByUser) {
                        m.readByUser = true;
                        updated = true;
                    }
                });
                if (updated) saveState();
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
                        bubble.style.maxWidth = '75%';
                        bubble.style.alignSelf = isMe ? 'flex-end' : 'flex-start';
                        bubble.style.background = isMe ? 'var(--primary-color)' : '#edf2f7';
                        bubble.style.color = isMe ? 'white' : '#2d3748';
                        bubble.style.padding = '10px 14px';
                        bubble.style.borderRadius = isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px';
                        bubble.style.boxShadow = '0 1px 2px rgba(0,0,0,0.08)';

                        const timeStr = new Date(m.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                        bubble.innerHTML = `
                            <div style="font-size: 0.75rem; opacity: 0.8; margin-bottom: 4px; font-weight: 600;">${isMe ? 'Vous' : 'Admin ZUBIKS'} • ${timeStr}</div>
                            <div style="font-size: 0.95rem; line-height: 1.45; word-break: break-word; white-space: pre-wrap;">${m.text}</div>
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
        if (currentUser && currentUser.role === 'admin') {
            const adminThreadsContainer = document.getElementById('admin-chat-threads');
            const adminChatMessages = document.getElementById('admin-chat-messages');
            const adminUnreadBadge = document.getElementById('admin-unread-msg-badge');
            const searchChatInput = document.getElementById('search-chat-member');
            const searchTerm = searchChatInput ? searchChatInput.value.toLowerCase() : '';

            const allMsgs = state.messages || [];
            const activeMembers = state.members.filter(m => m.status !== 'pending');
            
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

            const mobileBackBtn = document.getElementById('admin-chat-mobile-back');
            if (mobileBackBtn && !mobileBackBtn.hasAttribute('data-bound')) {
                mobileBackBtn.setAttribute('data-bound', 'true');
                mobileBackBtn.addEventListener('click', () => {
                    selectedAdminChatMemberId = null;
                    const chatGrid = document.querySelector('.admin-chat-grid');
                    if (chatGrid) chatGrid.classList.remove('mobile-chat-open');
                    renderAll();
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
                        const mMsgs = allMsgs.filter(msg => String(msg.memberId) === String(m.id));
                        const lastMsg = mMsgs[mMsgs.length - 1];
                        const unreadCount = mMsgs.filter(msg => msg.sender === 'user' && !msg.readByAdmin).length;

                        const item = document.createElement('div');
                        item.className = 'chat-thread-item';
                        item.style.padding = '10px';
                        item.style.borderRadius = '8px';
                        item.style.cursor = 'pointer';
                        item.style.background = String(m.id) === String(selectedAdminChatMemberId) ? '#e2e8f0' : 'white';
                        item.style.border = '1px solid #edf2f7';
                        item.style.display = 'flex';
                        item.style.justifyContent = 'space-between';
                        item.style.alignItems = 'center';

                        item.onclick = () => {
                            selectedAdminChatMemberId = m.id;
                            // Mark user messages as read by admin for this member
                            let markUpdated = false;
                            mMsgs.forEach(msg => {
                                if (msg.sender === 'user' && !msg.readByAdmin) {
                                    msg.readByAdmin = true;
                                    markUpdated = true;
                                }
                            });
                            const chatGrid = document.querySelector('.admin-chat-grid');
                            if (chatGrid) chatGrid.classList.add('mobile-chat-open');

                            if (markUpdated) saveState();
                            renderAll();
                        };

                        item.innerHTML = `
                            <div>
                                <strong style="font-size: 0.9rem; color: #2d3748;">${m.nom}</strong>
                                <div style="font-size: 0.8rem; color: #718096; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;">
                                    ${lastMsg ? lastMsg.text : 'Aucun message'}
                                </div>
                            </div>
                            ${unreadCount > 0 ? `<span class="badge" style="background: var(--danger); color: white; border-radius: 10px; padding: 2px 6px; font-size: 0.75rem;">${unreadCount}</span>` : ''}
                        `;
                        adminThreadsContainer.appendChild(item);
                    });
                } else {
                    adminThreadsContainer.innerHTML = '<div class="text-center text-muted" style="padding: 10px; font-size: 0.85rem;">Aucun membre trouvé.</div>';
                }
            }

            // Render selected conversation in Admin Chat Window
            const selectedMember = activeMembers.find(m => String(m.id) === String(selectedAdminChatMemberId));
            const chatHeaderName = document.getElementById('admin-chat-header-name');
            const chatHeaderInfo = document.getElementById('admin-chat-header-info');
            const chatInput = document.getElementById('admin-chat-input');
            const chatSendBtn = document.getElementById('admin-chat-send-btn');

            if (selectedMember) {
                if (chatHeaderName) chatHeaderName.textContent = selectedMember.nom;
                if (chatHeaderInfo) chatHeaderInfo.textContent = `${selectedMember.parts} part(s) • ${selectedMember.email || 'Email non spécifié'}`;
                if (chatInput) chatInput.disabled = false;
                if (chatSendBtn) chatSendBtn.disabled = false;

                const memberMsgs = allMsgs.filter(msg => String(msg.memberId) === String(selectedMember.id));
                if (adminChatMessages) {
                    adminChatMessages.innerHTML = '';
                    if (memberMsgs.length > 0) {
                        memberMsgs.forEach(m => {
                            const isAdminMsg = m.sender === 'admin';
                            const bubble = document.createElement('div');
                            bubble.style.maxWidth = '75%';
                            bubble.style.alignSelf = isAdminMsg ? 'flex-end' : 'flex-start';
                            bubble.style.background = isAdminMsg ? 'var(--primary-color)' : '#edf2f7';
                            bubble.style.color = isAdminMsg ? 'white' : '#2d3748';
                            bubble.style.padding = '10px 14px';
                            bubble.style.borderRadius = isAdminMsg ? '12px 12px 2px 12px' : '12px 12px 12px 2px';
                            bubble.style.boxShadow = '0 1px 2px rgba(0,0,0,0.08)';

                            const timeStr = new Date(m.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                            bubble.innerHTML = `
                                <div style="font-size: 0.75rem; opacity: 0.8; margin-bottom: 4px; font-weight: 600;">${isAdminMsg ? 'Vous (Admin)' : selectedMember.nom} • ${timeStr}</div>
                                <div style="font-size: 0.95rem; line-height: 1.45; word-break: break-word; white-space: pre-wrap;">${m.text}</div>
                            `;
                            adminChatMessages.appendChild(bubble);
                        });
                        adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
                    } else {
                        adminChatMessages.innerHTML = '<div class="text-center text-muted" style="margin-top: 60px;">Écrivez ci-dessous pour envoyer un message à ce membre.</div>';
                    }
                }
            } else {
                if (chatHeaderName) chatHeaderName.textContent = 'Sélectionnez un membre';
                if (chatHeaderInfo) chatHeaderInfo.textContent = 'Cliquez sur un membre à gauche pour lire et répondre.';
                if (chatInput) { chatInput.disabled = true; chatInput.value = ''; }
                if (chatSendBtn) chatSendBtn.disabled = true;
                if (adminChatMessages) adminChatMessages.innerHTML = '<div class="text-center text-muted" style="margin-top: 60px;">👈 Sélectionnez une conversation dans la liste de gauche pour afficher les messages.</div>';
            }
        }
    };

    // Chat Forms Event Handlers
    const userChatForm = document.getElementById('user-chat-form');
    if (userChatForm) {
        userChatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('user-chat-input');
            const text = input ? input.value.trim() : '';

            if (text && currentUser && currentUser.role !== 'admin') {
                if (!state.messages) state.messages = [];
                const newMsg = {
                    id: Date.now().toString(),
                    memberId: currentUser.id,
                    sender: 'user',
                    senderName: currentUser.nom,
                    text: text,
                    timestamp: new Date().toISOString(),
                    readByAdmin: false,
                    readByUser: true
                };
                state.messages.push(newMsg);
                saveState();
                renderAll();
                if (input) input.value = '';
            }
        });
    }

    const adminChatForm = document.getElementById('admin-chat-form');
    if (adminChatForm) {
        adminChatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('admin-chat-input');
            const text = input ? input.value.trim() : '';

            if (text && selectedAdminChatMemberId) {
                if (!state.messages) state.messages = [];
                const newMsg = {
                    id: Date.now().toString(),
                    memberId: selectedAdminChatMemberId,
                    sender: 'admin',
                    senderName: 'Admin ZUBIKS',
                    text: text,
                    timestamp: new Date().toISOString(),
                    readByAdmin: true,
                    readByUser: false
                };
                state.messages.push(newMsg);

                // Add notification to member account
                const targetMember = state.members.find(m => String(m.id) === String(selectedAdminChatMemberId));
                if (targetMember) {
                    if (!targetMember.notifications) targetMember.notifications = [];
                    targetMember.notifications.push({
                        id: Date.now().toString(),
                        message: `💬 Nouveau message de l'administrateur : "${text.length > 50 ? text.substring(0, 50) + '...' : text}"`,
                        date: new Date().toISOString(),
                        read: false
                    });
                }

                saveState();
                renderAll();
                if (input) { input.value = ''; input.style.height = 'auto'; }
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

    const showToast = (message, type = 'success') => {
        let container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = type === 'success' ? `✅ ${message}` : `❌ ${message}`;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

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

    validateOperationBtn.addEventListener('click', () => {
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
                
                // Confirmation insistante
                const isConfirmed = confirm(`Voulez-vous vraiment confirmer le ${typeName} de ${amount.toLocaleString('fr-FR')} Fc pour le membre ${member.nom} le ${new Date(opDate).toLocaleDateString('fr-FR')} ?\n\nCette action mettra à jour le solde.`);
                
                if (isConfirmed) {
                    if (currentOperationType === 'depot') {
                        member.totalDepot = (member.totalDepot || 0) + amount;
                        state.dailyDepots = (state.dailyDepots || 0) + amount;
                        state.cycleDepots = (state.cycleDepots || 0) + amount;
                    } else {
                        member.totalRetrait = (member.totalRetrait || 0) + amount;
                        state.dailyRetraits = (state.dailyRetraits || 0) + amount;
                        state.cycleRetraits = (state.cycleRetraits || 0) + amount;
                    }
                    
                    // Log the transaction
                    if (!state.transactions) state.transactions = [];
                    state.transactions.push({
                        id: Date.now().toString(),
                        memberId: member.id,
                        memberNom: member.nom,
                        type: currentOperationType,
                        amount: amount,
                        date: opDate,
                        timestamp: new Date().toISOString()
                    });

                    // Add Notification to user account
                    if (!member.notifications) member.notifications = [];
                    const notifMsg = currentOperationType === 'depot' 
                        ? `💵 Dépôt de ${amount.toLocaleString('fr-FR')} Fc enregistré en cash (liquidité) par l'administrateur le ${new Date(opDate).toLocaleDateString('fr-FR')}.`
                        : `📤 Retrait de ${amount.toLocaleString('fr-FR')} Fc enregistré en cash (liquidité) par l'administrateur le ${new Date(opDate).toLocaleDateString('fr-FR')}.`;

                    member.notifications.push({
                        id: Date.now().toString(),
                        message: notifMsg,
                        date: new Date().toISOString(),
                        read: false
                    });

                    saveState();
                    renderAll();
                    operationModal.classList.remove('active');
                    
                    // Message de succès non-bloquant
                    showToast(`Le ${typeName} de ${amount.toLocaleString('fr-FR')} Fc (Cash) a été enregistré.`, 'success');
                }
            }
        } else {
            showToast('Veuillez entrer un montant valide supérieur à 0.', 'error');
        }
    });

    // --- Member Edit, Delete & Details ---
    window.deleteMember = (id) => {
        const member = state.members.find(m => String(m.id) === String(id));
        if (member && confirm(`Voulez-vous vraiment supprimer le membre "${member.nom}" ?`)) {
            if (!state.deletedMembers) state.deletedMembers = [];
            state.deletedMembers.push({
                id: member.id,
                email: (member.email || '').toLowerCase(),
                nom: member.nom,
                deletedAt: new Date().toISOString()
            });

            state.members = state.members.filter(m => String(m.id) !== String(id));
            saveState();
            renderAll();
            showToast('Membre supprimé avec succès.', 'success');
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
        saveEditMemberBtn.addEventListener('click', () => {
            const id = editMemberIdInput.value;
            const newNom = editNomIdInput.value.trim();
            const newParts = parseInt(editPartsInput.value);

            if (newNom && newParts > 0) {
                const memberIndex = state.members.findIndex(m => String(m.id) === String(id));
                if (memberIndex !== -1) {
                    state.members[memberIndex].nom = newNom;
                    state.members[memberIndex].parts = newParts;
                    saveState();
                    renderAll();
                    if (currentUser && currentUser.id === id) {
                        currentUser = state.members[memberIndex];
                        switchRoleView();
                    }
                    if (editMemberModal) editMemberModal.classList.remove('active');
                    showToast('Membre mis à jour.', 'success');
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
                    
                    if (confirm('Souhaitez-vous FUSIONNER les données importées avec vos données actuelles ?\n\n- OK = Fusionner sans écraser\n- Annuler = Remplacer toutes les données')) {
                        // MERGE
                        const incomingMembers = importedState.members || [];
                        incomingMembers.forEach(incM => {
                            const existing = state.members.find(m => m.id === incM.id || m.nom === incM.nom);
                            if (existing) {
                                existing.totalDepot = (existing.totalDepot || 0) + (incM.totalDepot || 0);
                                existing.totalRetrait = (existing.totalRetrait || 0) + (incM.totalRetrait || 0);
                            } else {
                                state.members.push(incM);
                            }
                        });
                        
                        state.transactions = [...(state.transactions || []), ...(importedState.transactions || [])];
                        state.archives = [...(state.archives || []), ...(importedState.archives || [])];
                        state.dailyArchives = [...(state.dailyArchives || []), ...(importedState.dailyArchives || [])];
                        
                        state.dailyDepots = (state.dailyDepots || 0) + (importedState.dailyDepots || 0);
                        state.dailyRetraits = (state.dailyRetraits || 0) + (importedState.dailyRetraits || 0);
                        state.cycleDepots = (state.cycleDepots || 0) + (importedState.cycleDepots || 0);
                        state.cycleRetraits = (state.cycleRetraits || 0) + (importedState.cycleRetraits || 0);
                        
                        saveState();
                        showToast('Données fusionnées avec succès.', 'success');
                    } else {
                        if (confirm('Êtes-vous sûr de vouloir REMPLACER toutes vos données actuelles ? (Action irréversible)')) {
                            state = importedState;
                            if (!state.credentials) {
                                state.credentials = {
                                    email: 'zubiksservice@gmail.com',
                                    password: 'Zubiks@2000'
                                };
                            }
                            saveState();
                            showToast('Base de données remplacée avec succès.', 'success');
                        } else {
                            importFileInput.value = '';
                            return;
                        }
                    }
                    
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
        archiveDailyBtn.addEventListener('click', () => {
            if (confirm('Voulez-vous vraiment archiver la journée ? Cela remettra à zéro les compteurs journaliers.')) {
                if (!state.dailyArchives) state.dailyArchives = [];
                
                state.dailyArchives.push({
                    id: Date.now().toString(),
                    date: new Date().toISOString(),
                    dailyDepots: state.dailyDepots || 0,
                    dailyRetraits: state.dailyRetraits || 0
                });
                
                state.dailyDepots = 0;
                state.dailyRetraits = 0;
                
                saveState();
                renderAll();
                showToast('Journée archivée avec succès.', 'success');
            }
        });
    }
    if (archiveBtn) {
        archiveBtn.addEventListener('click', () => {
            const confirmArchive = confirm('ARCHIVAGE : Cette action va sauvegarder le cycle actuel et réinitialiser les compteurs.\n\nVoulez-vous continuer ?');
            if (!confirmArchive) return;

            const wishBackup = confirm('Voulez-vous télécharger une sauvegarde (.json) avant la réinitialisation ?');
            if (wishBackup && btnExportDb) {
                btnExportDb.click();
            }

            // Sauvegarder le cycle dans les archives
            const cycleSolde = (state.cycleDepots || 0) - (state.cycleRetraits || 0);
            
            const newArchive = {
                id: Date.now().toString(),
                date: new Date().toISOString(),
                cycleDepots: state.cycleDepots || 0,
                cycleRetraits: state.cycleRetraits || 0,
                solde: cycleSolde,
                membersSnapshot: JSON.parse(JSON.stringify(state.members)) // save snapshot of members state
            };
            
            if (!state.archives) state.archives = [];
            state.archives.push(newArchive);

            // Reset totals
            state.dailyDepots = 0;
            state.cycleDepots = 0;
            state.dailyRetraits = 0;
            state.cycleRetraits = 0;
            state.transactions = []; // On reset aussi les transactions pour le nouveau cycle

            // Reset members operations
            state.members.forEach(m => {
                m.totalDepot = 0;
                m.totalRetrait = 0;
            });

            saveState();
            renderAll();
            showToast('Cycle sauvegardé avec succès. Nouveau cycle démarré.', 'success');
        });
    }

    // --- Reset Database Logic ---
    const resetDatabaseBtn = document.getElementById('reset-database-btn');
    if (resetDatabaseBtn) {
        resetDatabaseBtn.addEventListener('click', () => {
            const doubleConfirm = confirm("⚠️ ATTENTION : Êtes-vous sûr de vouloir réinitialiser COMPLÈTEMENT toutes les données ?\n\nCette action supprimera définitivement tous les membres, les transactions et tous les historiques d'archives.");
            
            if (doubleConfirm) {
                const passwordConfirm = prompt("Sécurité : Veuillez entrer le mot de passe administrateur pour confirmer la réinitialisation :");
                
                const targetPassword = (state.credentials && state.credentials.password) ? state.credentials.password : 'Zubiks@2000';
                if (passwordConfirm === targetPassword) {
                    // Reset to empty state template while keeping rules and credentials
                    const currentReglements = state.reglements || "";
                    const currentCredentials = state.credentials || {
                        email: 'zubiksservice@gmail.com',
                        password: 'Zubiks@2000'
                    };
                    state = {
                        members: [],
                        dailyDepots: 0,
                        dailyRetraits: 0,
                        cycleDepots: 0,
                        cycleRetraits: 0,
                        argentDebut: 0,
                        reglements: currentReglements,
                        archives: [],
                        dailyArchives: [],
                        transactions: [],
                        credentials: currentCredentials
                    };
                    
                    saveState();
                    renderAll();
                    showToast("Toutes les données ont été réinitialisées avec succès.", "success");
                    
                    // Force refresh rules text area value
                    const textarea = document.querySelector('.modern-textarea');
                    if (textarea) textarea.value = currentReglements;

                    // Populate change credentials email
                    const changeEmailInput = document.getElementById('change-email');
                    if (changeEmailInput) {
                        changeEmailInput.value = currentCredentials.email;
                    }
                } else if (passwordConfirm !== null) {
                    showToast("Mot de passe incorrect. Réinitialisation annulée.", "error");
                }
            }
        });
    }

    // --- Change Credentials ---
    const changeCredentialsForm = document.getElementById('change-credentials-form');
    if (changeCredentialsForm) {
        changeCredentialsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newEmail = document.getElementById('change-email').value.trim();
            const newPassword = document.getElementById('change-password').value;

            if (!newEmail || !newPassword) {
                showToast("Veuillez remplir tous les champs.", "error");
                return;
            }

            try {
                const res = await fetch('/api/auth/credentials', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${currentJwtToken}`
                    },
                    body: JSON.stringify({ newEmail, newPassword })
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                    showToast(data.error || "Erreur lors de la mise à jour.", "error");
                    return;
                }

                if (!state.credentials) state.credentials = {};
                state.credentials.email = newEmail;
                state.credentials.password = newPassword;

                if (currentUser && currentUser.role === 'admin') {
                    currentUser.email = newEmail;
                    saveActiveSession(currentUser);
                }

                await saveState();

                showToast("Identifiants de connexion mis à jour avec succès !", "success");
                document.getElementById('change-password').value = '';
            } catch (err) {
                const lowerNewEmail = newEmail.toLowerCase();
                const existingMember = state.members.find(m => (m.email || '').toLowerCase() === lowerNewEmail);
                if (existingMember) {
                    showToast("Cette adresse email est déjà utilisée par un membre.", "error");
                    return;
                }

                if (!state.credentials) state.credentials = {};
                state.credentials.email = newEmail;
                state.credentials.password = newPassword;

                if (currentUser && currentUser.role === 'admin') {
                    currentUser.email = newEmail;
                    saveActiveSession(currentUser);
                }

                saveState();
                showToast("Identifiants de connexion mis à jour (mode local) !", "success");
                document.getElementById('change-password').value = '';
            }
        });
    }

    // --- Textarea Save logic (A propos) ---
    const textarea = document.querySelector('.modern-textarea');
    if (textarea) {
        textarea.value = state.reglements || "";
        textarea.addEventListener('input', (e) => {
            state.reglements = e.target.value;
            saveState();
        });
    }

    // --- Mark all notifications read ---
    const btnMarkAllRead = document.getElementById('btn-mark-all-read');
    if (btnMarkAllRead) {
        btnMarkAllRead.addEventListener('click', () => {
            if (currentUser && currentUser.role !== 'admin' && currentUser.notifications) {
                currentUser.notifications.forEach(n => n.read = true);
                saveState();
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
                email: user.email || null
            }));
        }
    };

    const checkAndRestoreSession = () => {
        const savedSession = localStorage.getItem(SESSION_KEY);
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
                        email: (state.credentials && state.credentials.email) ? state.credentials.email : 'zubiksservice@gmail.com'
                    };
                } else if (sess.id || sess.email) {
                    const userMatch = state.members.find(m => String(m.id) === String(sess.id) || (m.email && m.email.toLowerCase() === (sess.email || '').toLowerCase()));
                    if (userMatch) {
                        currentUser = userMatch;
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
                }
            } catch (e) {
                console.error("Erreur lors de la restauration de la session :", e);
                localStorage.removeItem(SESSION_KEY);
            }
        }
    };

    // Initialize
    loadState().then(() => {
        checkAndRestoreSession();
    }).catch(() => {
        checkAndRestoreSession();
    });
});
