-- ========================================================
-- SCHÉMA DE BASE DE DONNÉES CLOUD POSTGRESQL - ZUBIKS SERVICE
-- ========================================================

-- 1. UTILISATEURS (Comptes Administrateurs & Utilisateurs)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    nom_complet VARCHAR(255) NOT NULL,
    username VARCHAR(100) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    telephone VARCHAR(50),
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user', -- 'admin' | 'user'
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'pending' | 'active' | 'disabled'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. MEMBRES DE LA RISTOURNE
CREATE TABLE IF NOT EXISTS members (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    nom VARCHAR(255) NOT NULL,
    postnom VARCHAR(255),
    sexe VARCHAR(20) DEFAULT 'Homme',
    email VARCHAR(255),
    telephone VARCHAR(50),
    adresse TEXT,
    parts INTEGER DEFAULT 0 CHECK (parts >= 0),
    total_depot NUMERIC(15, 2) DEFAULT 0 CHECK (total_depot >= 0),
    total_retrait NUMERIC(15, 2) DEFAULT 0 CHECK (total_retrait >= 0),
    status VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'active' | 'disabled'
    date_ajout TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- 3. RISTOURNES (Cycles de ristourne)
CREATE TABLE IF NOT EXISTS ristournes (
    id VARCHAR(64) PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    description TEXT,
    date_debut TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    date_fin TIMESTAMP WITH TIME ZONE,
    valeur_part NUMERIC(15, 2) DEFAULT 0,
    total_parts INTEGER DEFAULT 0,
    total_depots NUMERIC(15, 2) DEFAULT 0,
    total_retraits NUMERIC(15, 2) DEFAULT 0,
    argent_debut NUMERIC(15, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active', -- 'active' | 'completed' | 'suspended'
    created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. PARTS (Attribution de parts)
CREATE TABLE IF NOT EXISTS member_shares (
    id VARCHAR(64) PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    ristourne_id VARCHAR(64) REFERENCES ristournes(id) ON DELETE CASCADE,
    nombre_parts INTEGER NOT NULL CHECK (nombre_parts >= 0),
    valeur_part NUMERIC(15, 2) DEFAULT 0,
    valeur_totale NUMERIC(15, 2) DEFAULT 0,
    date_attribution TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. CONTRIBUTIONS ET TRANSACTIONS (Dépôts et Retraits)
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(64) PRIMARY KEY,
    member_id VARCHAR(64) REFERENCES members(id) ON DELETE CASCADE,
    ristourne_id VARCHAR(64) REFERENCES ristournes(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL, -- 'depot' | 'retrait'
    montant NUMERIC(15, 2) NOT NULL CHECK (montant > 0),
    nombre_parts INTEGER DEFAULT 0,
    date_transaction TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    mode_paiement VARCHAR(50) DEFAULT 'cash',
    reference VARCHAR(255),
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. RISTOURNES VERSÉES / DÉCAISSEMENTS
CREATE TABLE IF NOT EXISTS versements (
    id VARCHAR(64) PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    ristourne_id VARCHAR(64) REFERENCES ristournes(id) ON DELETE CASCADE,
    montant NUMERIC(15, 2) NOT NULL CHECK (montant > 0),
    date_versement TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    statut VARCHAR(20) DEFAULT 'effectue', -- 'effectue' | 'en_attente' | 'annule'
    reference VARCHAR(255),
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. AUDIT LOGS (Journal d'historique des opérations)
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    user_name VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    record_id VARCHAR(64),
    ancienne_valeur JSONB,
    nouvelle_valeur JSONB,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. PARAMÈTRES ET CONFIGURATION DE L'APPLICATION
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. NOTIFICATIONS & MESSAGES
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    member_id VARCHAR(64) REFERENCES members(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    read BOOLEAN DEFAULT FALSE,
    sender VARCHAR(50) DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(64) PRIMARY KEY,
    member_id VARCHAR(64) REFERENCES members(id) ON DELETE CASCADE,
    sender VARCHAR(50) NOT NULL, -- 'admin' | 'user'
    sender_name VARCHAR(255),
    text TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    read_by_admin BOOLEAN DEFAULT FALSE,
    read_by_user BOOLEAN DEFAULT FALSE
);

-- 10. ARCHIVES JOURNALIÈRES ET CYCLES ARCHIVÉS
CREATE TABLE IF NOT EXISTS daily_archives (
    id VARCHAR(64) PRIMARY KEY,
    date_jour VARCHAR(50) NOT NULL,
    argent_debut NUMERIC(15, 2) DEFAULT 0,
    total_depots NUMERIC(15, 2) DEFAULT 0,
    total_retraits NUMERIC(15, 2) DEFAULT 0,
    solde_cloture NUMERIC(15, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cycle_archives (
    id VARCHAR(64) PRIMARY KEY,
    nom_cycle VARCHAR(255) NOT NULL,
    date_archivage TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_depots NUMERIC(15, 2) DEFAULT 0,
    total_retraits NUMERIC(15, 2) DEFAULT 0,
    snapshot_data JSONB NOT NULL
);

-- INDEXES POUR ACCÉLÉRER LES RECHERCHES
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_member ON transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date_transaction);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_messages_member ON messages(member_id);
