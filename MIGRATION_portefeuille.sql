-- =====================================================
-- PORTEFEUILLE (Document Management) MIGRATION
-- Run this in the Supabase SQL Editor (all at once).
--
-- Creates the document-storage tables used by the Portefeuille module:
--   portefeuille_folders  — (optionally nested) folders
--   portefeuille_files    — uploaded files (base64 data URL or Storage URL)
--   portefeuille_papers   — editable rich-text documents ("papers")
--
-- Mirrors the local SQLite schema in src-tauri/src/db/schema.rs (v3).
-- =====================================================

-- ====== Folders (self-referencing for nesting) ======
CREATE TABLE IF NOT EXISTS portefeuille_folders (
    id          BIGSERIAL PRIMARY KEY,
    nom         TEXT NOT NULL,
    parent_id   BIGINT REFERENCES portefeuille_folders(id) ON DELETE CASCADE,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    user_id     UUID
);

-- ====== Files ======
CREATE TABLE IF NOT EXISTS portefeuille_files (
    id          BIGSERIAL PRIMARY KEY,
    nom         TEXT NOT NULL,
    folder_id   BIGINT REFERENCES portefeuille_folders(id) ON DELETE CASCADE,
    mime_type   TEXT,
    extension   TEXT,
    size_bytes  BIGINT DEFAULT 0,
    url         TEXT,
    data        TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    user_id     UUID
);

-- ====== Papers (rich-text documents) ======
CREATE TABLE IF NOT EXISTS portefeuille_papers (
    id          BIGSERIAL PRIMARY KEY,
    titre       TEXT NOT NULL,
    folder_id   BIGINT REFERENCES portefeuille_folders(id) ON DELETE CASCADE,
    content     TEXT DEFAULT '',
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    user_id     UUID
);

-- ====== Indexes ======
CREATE INDEX IF NOT EXISTS idx_pf_folders_parent ON portefeuille_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_pf_folders_user   ON portefeuille_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_pf_files_folder   ON portefeuille_files(folder_id);
CREATE INDEX IF NOT EXISTS idx_pf_files_user     ON portefeuille_files(user_id);
CREATE INDEX IF NOT EXISTS idx_pf_papers_folder  ON portefeuille_papers(folder_id);
CREATE INDEX IF NOT EXISTS idx_pf_papers_user    ON portefeuille_papers(user_id);

-- ====== Row Level Security (scope every row to its owner) ======
ALTER TABLE portefeuille_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE portefeuille_files   ENABLE ROW LEVEL SECURITY;
ALTER TABLE portefeuille_papers  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pf_folders_owner ON portefeuille_folders;
CREATE POLICY pf_folders_owner ON portefeuille_folders
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS pf_files_owner ON portefeuille_files;
CREATE POLICY pf_files_owner ON portefeuille_files
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS pf_papers_owner ON portefeuille_papers;
CREATE POLICY pf_papers_owner ON portefeuille_papers
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

SELECT 'Portefeuille migration complete!' AS status;
