-- ============================================================================
-- MIGRATION: Batch (Lot) & Expiration Management System (FEFO)
-- Run this on an existing Supabase/Postgres database to add batch tracking.
-- Safe to run multiple times (idempotent).
-- ============================================================================

-- 1. Product batches table -----------------------------------------------------
-- Expiration data lives ONLY here (never on the product). The product
-- `stock_actuel` is kept as the denormalised sum of active batch remaining
-- quantities so existing dashboard / low-stock logic keeps working.
CREATE TABLE IF NOT EXISTS product_batches (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    produit_id BIGINT REFERENCES produits(id) ON DELETE CASCADE,
    bon_commande_id BIGINT REFERENCES bons_commande(id) ON DELETE SET NULL,
    supplier_id BIGINT REFERENCES fournisseurs(id) ON DELETE SET NULL,
    lot_number TEXT,
    quantity_initial DECIMAL(15, 2) DEFAULT 0,
    quantity_remaining DECIMAL(15, 2) DEFAULT 0,
    purchase_price DECIMAL(15, 2) DEFAULT 0,
    received_date DATE DEFAULT CURRENT_DATE,
    expiration_date DATE,
    alert_before_days INTEGER DEFAULT 30,
    status TEXT DEFAULT 'Active', -- Active | Expired | Empty
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_batches_user_id_idx        ON product_batches (user_id);
CREATE INDEX IF NOT EXISTS product_batches_produit_id_idx     ON product_batches (produit_id);
CREATE INDEX IF NOT EXISTS product_batches_bon_commande_idx   ON product_batches (bon_commande_id);
CREATE INDEX IF NOT EXISTS product_batches_expiration_idx     ON product_batches (expiration_date);

-- 2. Capture lot / expiry on purchase-order lines ------------------------------
ALTER TABLE bon_commande_lignes ADD COLUMN IF NOT EXISTS numero_lot TEXT;
ALTER TABLE bon_commande_lignes ADD COLUMN IF NOT EXISTS date_peremption DATE;
ALTER TABLE bon_commande_lignes ADD COLUMN IF NOT EXISTS alert_before_days INTEGER DEFAULT 30;

-- 3. Batch traceability on stock movements (for exact reversal) ----------------
ALTER TABLE mouvements_stock ADD COLUMN IF NOT EXISTS batch_id BIGINT;

-- 4. Expiration settings on parametres -----------------------------------------
ALTER TABLE parametres ADD COLUMN IF NOT EXISTS expiration_default_alert_days INTEGER DEFAULT 30;
ALTER TABLE parametres ADD COLUMN IF NOT EXISTS expiration_allow_custom_alert BOOLEAN DEFAULT TRUE;
ALTER TABLE parametres ADD COLUMN IF NOT EXISTS expiration_include_in_stock BOOLEAN DEFAULT FALSE;
ALTER TABLE parametres ADD COLUMN IF NOT EXISTS expiration_prevent_expired_sale BOOLEAN DEFAULT TRUE;
ALTER TABLE parametres ADD COLUMN IF NOT EXISTS expiration_warn_colors BOOLEAN DEFAULT TRUE;

-- 5. updated_at trigger for product_batches ------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        EXECUTE 'DROP TRIGGER IF EXISTS update_product_batches_updated_at ON product_batches';
        EXECUTE 'CREATE TRIGGER update_product_batches_updated_at BEFORE UPDATE ON product_batches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
    END IF;
END $$;
