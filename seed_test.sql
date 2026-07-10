-- ============================================================================
--  SmartGestion / ParaPharmacie — TEST SEED DATA
-- ============================================================================
--
--  HOW TO USE
--  ----------
--  1. All rows are attached to your user id:
--         user_id = 8fd29429-3c49-4fe4-b393-6bd2fdb83094
--     (Make sure you are logged in as THAT user in the app.)
--
--  2. Open the in-app SQL Editor (/sql-editor) and paste this whole file,
--     then run it.
--
--  3. Refresh the app. You should now see clients, suppliers, products,
--     quotes, invoices (all statuses), purchase orders, deliveries, expenses,
--     walk-in sales, remises and a populated dashboard / workspace.
--
--  NOTES
--  -----
--  * Safe to re-run: it first DELETES all existing rows for this user id
--    (see the CLEANUP section) before re-inserting. Comment out the CLEANUP
--    block if you want to keep existing data.
--  * If you ever need a different user, find/replace the id below with yours.
--  * All amounts are in DH. TVA is 20% unless stated otherwise.
--  * Dates use CURRENT_DATE offsets so the dashboard time filters have data
--    across the last few months.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  CLEANUP — remove previous test data for a clean, idempotent re-seed
-- ----------------------------------------------------------------------------
DELETE FROM facture_lignes WHERE facture_id IN (SELECT id FROM factures WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094');
DELETE FROM devis_lignes WHERE devis_id IN (SELECT id FROM devis WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094');
DELETE FROM avoir_lignes WHERE avoir_id IN (SELECT id FROM avoirs WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094');
DELETE FROM bon_commande_lignes WHERE bon_commande_id IN (SELECT id FROM bons_commande WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094');
DELETE FROM bon_livraison_lignes WHERE bon_livraison_id IN (SELECT id FROM bons_livraison WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094');
DELETE FROM bon_livraison_client_lignes WHERE bon_livraison_client_id IN (SELECT id FROM bons_livraison_client WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094');
DELETE FROM avoir_fournisseur_lignes WHERE avoir_fournisseur_id IN (SELECT id FROM avoirs_fournisseur WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094');
DELETE FROM ventes_passagers_lignes WHERE vente_passager_id IN (SELECT id FROM ventes_passagers WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094');

DELETE FROM avoirs                WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094';
DELETE FROM avoirs_fournisseur    WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094';
DELETE FROM bons_livraison_client WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094';
DELETE FROM bons_livraison        WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094';
DELETE FROM factures              WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094';
DELETE FROM devis                 WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094';
DELETE FROM bons_commande         WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094';
DELETE FROM depenses              WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094';
DELETE FROM ventes_passagers      WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094';
DELETE FROM produits              WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094';
DELETE FROM clients               WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094';
DELETE FROM fournisseurs          WHERE user_id = '8fd29429-3c49-4fe4-b393-6bd2fdb83094';

-- ----------------------------------------------------------------------------
--  PARAMETRES (company settings) — one row per user (user_id is UNIQUE)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO parametres (
    nom_entreprise, nom_societe, adresse, ville, code_postale, telephone, email,
    ice, rc, if_number, tp_patente, cnss, capital_social, forme_juridique,
    site_web, banque, rib, swift, devise, couleur_principale,
    conditions_paiement_defaut, pied_page_defaut,
    activer_droit_timbre, activer_filigrane, texte_filigrane, watermark_text,
    user_id
) VALUES (
    'ParaPharma Test SARL', 'ParaPharma Test SARL',
    '12 Rue des Lilas, Quartier Maârif', 'Casablanca', '20000',
    '+212 522 00 00 00', 'contact@parapharma-test.ma',
    '001234567000089', 'RC123456', 'IF7654321', 'TP998877', 'CNSS445566',
    '100000', 'SARL', 'www.parapharma-test.ma',
    'Banque Populaire', '011 780 0000000000000000 12', 'BCPOMAMC',
    'DH', '#2563EB',
    'Paiement à 30 jours', 'Merci de votre confiance — ParaPharma Test SARL',
    1, 1, 'ParaPharma', 'ParaPharma',
    '8fd29429-3c49-4fe4-b393-6bd2fdb83094'
);

-- ----------------------------------------------------------------------------
--  CLIENTS
-- ----------------------------------------------------------------------------
INSERT INTO clients (nom, nom_societe, code, type, email, telephone, adresse, ville, code_postal, pays, ice, rc, if_identifiant, patente, notes, user_id) VALUES
('Pharmacie Al Amal',      'Pharmacie Al Amal',      'CLT-0001', 'entreprise', 'alamal@mail.ma',   '+212 661 111 111', '5 Bd Zerktouni',        'Casablanca', '20100', 'Maroc', 'ICE001', 'RC1001', 'IF1001', 'PAT1001', 'Client fidèle',        '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('Clinique Ibn Sina',      'Clinique Ibn Sina',      'CLT-0002', 'entreprise', 'ibnsina@mail.ma',  '+212 662 222 222', '18 Av. Hassan II',      'Rabat',      '10000', 'Maroc', 'ICE002', 'RC1002', 'IF1002', 'PAT1002', NULL,                    '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('Parapharmacie Nour',     'Parapharmacie Nour',     'CLT-0003', 'entreprise', 'nour@mail.ma',     '+212 663 333 333', '2 Rue de Fès',          'Marrakech',  '40000', 'Maroc', 'ICE003', 'RC1003', 'IF1003', 'PAT1003', 'Paiement souvent tardif','8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('Mme Fatima Zahra',       NULL,                     'CLT-0004', 'particulier','fzahra@mail.ma',   '+212 664 444 444', 'Résidence Al Andalous', 'Fès',        '30000', 'Maroc', NULL,     NULL,     NULL,     NULL,      'Client particulier',    '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('Centre Médical Atlas',   'Centre Médical Atlas',   'CLT-0005', 'entreprise', 'atlas@mail.ma',    '+212 665 555 555', '44 Bd Mohammed V',      'Tanger',     '90000', 'Maroc', 'ICE005', 'RC1005', 'IF1005', 'PAT1005', NULL,                    '8fd29429-3c49-4fe4-b393-6bd2fdb83094');

-- ----------------------------------------------------------------------------
--  FOURNISSEURS (suppliers)
-- ----------------------------------------------------------------------------
INSERT INTO fournisseurs (nom, nom_societe, code, type, contact, email, telephone, adresse, ville, code_postale, ice, notes, user_id) VALUES
('Labo Cosmétique Maroc',  'Labo Cosmétique Maroc',  'FRN-0001', 'entreprise', 'M. Alaoui',   'labocosmetique@mail.ma', '+212 522 101010', 'Zone Ind. Sidi Bernoussi', 'Casablanca', '20600', 'ICEF001', 'Livraison rapide',   '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('Distri Pharma Plus',     'Distri Pharma Plus',     'FRN-0002', 'entreprise', 'Mme Bennani', 'distripharma@mail.ma',   '+212 537 202020', '7 Av. des FAR',            'Rabat',      '10010', 'ICEF002', NULL,                 '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('Import Santé Beauté',    'Import Santé Beauté',    'FRN-0003', 'entreprise', 'M. Tazi',     'importsante@mail.ma',    '+212 524 303030', '9 Rue Ibn Toumert',        'Marrakech',  '40010', 'ICEF003', 'Produits premium',   '8fd29429-3c49-4fe4-b393-6bd2fdb83094');

-- ----------------------------------------------------------------------------
--  PRODUITS (products) — TVA 20% (default). prix_achat_ttc / prix_vente_ttc
--  are stored for convenience; calc_remise feeds the Remises page fallback.
-- ----------------------------------------------------------------------------
INSERT INTO produits (reference, designation, nom, categorie, marque, barcode, prix_achat_ht, prix_vente_ht, tva, taux_tva, prix_achat_ttc, prix_vente_ttc, stock_actuel, stock_min, unite, calc_vente_ttc, calc_remise, is_active, user_id) VALUES
('PRD-001', 'Crème hydratante visage 50ml', 'Crème hydratante visage 50ml', 'Soins visage',  'Nivea',    '6001111100011', 40.00,  75.00,  20, 20, 48.00,  90.00,  120, 20, 'unité', 90.00,  5,  1, '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('PRD-002', 'Shampoing anti-chute 250ml',   'Shampoing anti-chute 250ml',   'Cheveux',       'Vichy',    '6001111100028', 55.00,  99.00,  20, 20, 66.00,  118.80, 80,  15, 'unité', 118.80, 10, 1, '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('PRD-003', 'Sérum vitamine C 30ml',        'Sérum vitamine C 30ml',        'Soins visage',  'La Roche', '6001111100035', 90.00,  160.00, 20, 20, 108.00, 192.00, 45,  10, 'unité', 192.00, 0,  1, '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('PRD-004', 'Gel douche 500ml',             'Gel douche 500ml',             'Hygiène',       'Dove',     '6001111100042', 18.00,  35.00,  20, 20, 21.60,  42.00,  200, 30, 'unité', 42.00,  0,  1, '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('PRD-005', 'Complément multivitamines 60c','Complément multivitamines 60c','Compléments',   'Bion3',    '6001111100059', 70.00,  130.00, 20, 20, 84.00,  156.00, 8,   10, 'boîte', 156.00, 8,  1, '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('PRD-006', 'Crème solaire SPF50 200ml',    'Crème solaire SPF50 200ml',    'Solaire',       'Avene',    '6001111100066', 65.00,  120.00, 20, 20, 78.00,  144.00, 60,  12, 'unité', 144.00, 0,  1, '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('PRD-007', 'Dentifrice blancheur 75ml',    'Dentifrice blancheur 75ml',    'Hygiène',       'Signal',   '6001111100073', 12.00,  25.00,  20, 20, 14.40,  30.00,  150, 25, 'unité', 30.00,  0,  1, '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('PRD-008', 'Huile d''argan bio 100ml',     'Huile d''argan bio 100ml',     'Soins corps',   'Bio Argan','6001111100080', 45.00,  85.00,  20, 20, 54.00,  102.00, 3,   10, 'flacon',102.00, 0,  1, '8fd29429-3c49-4fe4-b393-6bd2fdb83094');

-- ============================================================================
--  DEVIS (quotes) — various statuses
-- ============================================================================
INSERT INTO devis (numero, client_id, date_emission, date_validite, statut, montant_ht, montant_tva, montant_ttc, notes, conditions_paiement, mode_paiement, user_id) VALUES
('DEV-2026-0001', (SELECT id FROM clients WHERE code='CLT-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-40 days'), date('now','-10 days'), 'accepté',  435.00, 87.00, 522.00, 'Devis accepté',   'Paiement à 30 jours', 'Virement', '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('DEV-2026-0002', (SELECT id FROM clients WHERE code='CLT-0002' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-20 days'), date('now','+10 days'), 'envoyé',   320.00, 64.00, 384.00, 'En attente',      'Paiement à 30 jours', 'Chèque',   '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('DEV-2026-0003', (SELECT id FROM clients WHERE code='CLT-0003' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-5 days'),  date('now','+25 days'), 'brouillon',150.00, 30.00, 180.00, 'Brouillon',       'Paiement comptant',   'Espèces',  '8fd29429-3c49-4fe4-b393-6bd2fdb83094');

INSERT INTO devis_lignes (devis_id, produit_id, reference, designation, quantite, prix_unitaire_ht, tva, remise, prix_vente_ttc, montant_ht, montant_tva, montant_ttc, ordre) VALUES
((SELECT id FROM devis WHERE numero='DEV-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-001', 'Crème hydratante visage 50ml', 3, 75.00,  20, 5,  90.00,  225.00, 45.00, 270.00, 0),
((SELECT id FROM devis WHERE numero='DEV-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-007' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-007', 'Dentifrice blancheur 75ml',    8, 25.00,  20, 0,  30.00,  200.00, 40.00, 240.00, 1),
((SELECT id FROM devis WHERE numero='DEV-2026-0002' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-002' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-002', 'Shampoing anti-chute 250ml',   2, 99.00,  20, 0,  118.80, 198.00, 39.60, 237.60, 0),
((SELECT id FROM devis WHERE numero='DEV-2026-0003' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-004' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-004', 'Gel douche 500ml',             4, 35.00,  20, 0,  42.00,  140.00, 28.00, 168.00, 0);

-- ============================================================================
--  FACTURES (invoices) — ALL statuses so the Dashboard CA has data.
--    payée         -> counts in CA (paid)
--    reste_a_payer -> counts in CA + shows in Receivables
--    en_attente    -> NOT in CA
--    brouillon     -> NOT in CA
--    annulée       -> NOT in CA
--  stock_updated = 1 for active (payée / reste_a_payer) invoices.
-- ============================================================================
INSERT INTO factures (numero, client_id, date_emission, date_echeance, statut, mode_paiement, montant_ht, montant_tva, montant_ttc, reste_a_payer, cogs, stock_updated, notes, conditions_paiement, user_id) VALUES
('FAC-2026-0001', (SELECT id FROM clients WHERE code='CLT-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-60 days'), date('now','-30 days'), 'payée',        'Virement', 375.00, 75.00,  450.00, 0.00,   200.00, 1, 'Facture réglée',        'Paiement à 30 jours', '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('FAC-2026-0002', (SELECT id FROM clients WHERE code='CLT-0002' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-45 days'), date('now','-15 days'), 'payée',        'Chèque',   640.00, 128.00, 768.00, 0.00,   360.00, 1, NULL,                     'Paiement à 30 jours', '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('FAC-2026-0003', (SELECT id FROM clients WHERE code='CLT-0003' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-25 days'), date('now','+5 days'),  'reste_a_payer','Espèces',  500.00, 100.00, 600.00, 250.00, 280.00, 1, 'Acompte de 350 DH',      'Paiement à 30 jours', '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('FAC-2026-0004', (SELECT id FROM clients WHERE code='CLT-0005' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-10 days'), date('now','+20 days'), 'en_attente',   'Virement', 260.00, 52.00,  312.00, 312.00, 0.00,   0, 'En attente de paiement', 'Paiement à 30 jours', '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('FAC-2026-0005', (SELECT id FROM clients WHERE code='CLT-0004' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-3 days'),  date('now','+27 days'), 'brouillon',    'Espèces',  90.00,  18.00,  108.00, 108.00, 0.00,   0, 'Brouillon',              'Paiement comptant',   '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('FAC-2026-0006', (SELECT id FROM clients WHERE code='CLT-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-2 days'),  date('now','+28 days'), 'annulée',      'Virement', 200.00, 40.00,  240.00, 0.00,   0.00,   0, 'Annulée par le client',  'Paiement à 30 jours', '8fd29429-3c49-4fe4-b393-6bd2fdb83094');

INSERT INTO facture_lignes (facture_id, produit_id, reference, designation, quantite, prix_unitaire_ht, tva, remise, prix_vente_ttc, montant_ht, montant_ttc, ordre) VALUES
-- FAC-0001 (payée)
((SELECT id FROM factures WHERE numero='FAC-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-001', 'Crème hydratante visage 50ml', 5, 75.00,  20, 0, 90.00,  375.00, 450.00, 0),
-- FAC-0002 (payée)
((SELECT id FROM factures WHERE numero='FAC-2026-0002' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-003' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-003', 'Sérum vitamine C 30ml',        4, 160.00, 20, 0, 192.00, 640.00, 768.00, 0),
-- FAC-0003 (reste_a_payer)
((SELECT id FROM factures WHERE numero='FAC-2026-0003' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-006' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-006', 'Crème solaire SPF50 200ml',    5, 120.00, 20, 0, 144.00, 600.00, 720.00, 0),
-- FAC-0004 (en_attente)
((SELECT id FROM factures WHERE numero='FAC-2026-0004' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-002' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-002', 'Shampoing anti-chute 250ml',   2, 99.00,  20, 0, 118.80, 198.00, 237.60, 0),
-- FAC-0005 (brouillon)
((SELECT id FROM factures WHERE numero='FAC-2026-0005' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-001', 'Crème hydratante visage 50ml', 1, 75.00,  20, 0, 90.00,  75.00,  90.00,  0),
-- FAC-0006 (annulée)
((SELECT id FROM factures WHERE numero='FAC-2026-0006' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-005' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-005', 'Complément multivitamines 60c',1, 130.00, 20, 0, 156.00, 130.00, 156.00, 0);

-- Bon de Livraison Client auto-linked to a paid facture (feature test)
INSERT INTO bons_livraison_client (numero, client_id, facture_id, date_livraison, statut, montant_ht, montant_tva, montant_ttc, notes, user_id) VALUES
('BLC-2026-0001', (SELECT id FROM clients WHERE code='CLT-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM factures WHERE numero='FAC-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-58 days'), 'en_attente', 375.00, 75.00, 450.00, 'Bon de livraison généré pour la facture FAC-2026-0001', '8fd29429-3c49-4fe4-b393-6bd2fdb83094');

INSERT INTO bon_livraison_client_lignes (bon_livraison_client_id, produit_id, reference, designation, quantite, prix_unitaire_ht, tva, remise, prix_vente_ttc, montant_ht, montant_ttc, ordre) VALUES
((SELECT id FROM bons_livraison_client WHERE numero='BLC-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-001', 'Crème hydratante visage 50ml', 5, 75.00, 20, 0, 90.00, 375.00, 450.00, 0);

-- ============================================================================
--  AVOIRS (customer credit notes)
-- ============================================================================
INSERT INTO avoirs (numero, facture_id, client_id, date_emission, motif, montant_ht, montant_tva, montant_ttc, statut, notes, user_id) VALUES
('AV-2026-0001', (SELECT id FROM factures WHERE numero='FAC-2026-0006' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM clients WHERE code='CLT-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-2 days'), 'Annulation facture', 200.00, 40.00, 240.00, 'Généré', 'Avoir pour annulation de la facture FAC-2026-0006', '8fd29429-3c49-4fe4-b393-6bd2fdb83094');

INSERT INTO avoir_lignes (avoir_id, produit_id, reference, designation, quantite, prix_unitaire_ht, tva, montant_ht, montant_ttc, ordre) VALUES
((SELECT id FROM avoirs WHERE numero='AV-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-005' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-005', 'Complément multivitamines 60c', 1, 130.00, 20, 130.00, 156.00, 0);

-- ============================================================================
--  BONS DE COMMANDE (purchase orders) — various statuses incl. livré/annulé
--  (tests the new bl_fournisseur + motif_annulation fields & edit locking)
-- ============================================================================
INSERT INTO bons_commande (numero, fournisseur_id, date_commande, date_livraison_prevue, statut, montant_ht, montant_tva, montant_ttc, notes, bl_fournisseur, motif_annulation, stock_updated, user_id) VALUES
('BC-2026-0001', (SELECT id FROM fournisseurs WHERE code='FRN-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-50 days'), date('now','-40 days'), 'livré',     800.00, 160.00, 960.00, 'Réappro crèmes',   'BLF-2025-778', NULL,                       1, '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('BC-2026-0002', (SELECT id FROM fournisseurs WHERE code='FRN-0002' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-30 days'), date('now','-20 days'), 'confirmé',  550.00, 110.00, 660.00, 'Commande confirmée',NULL,          NULL,                       0, '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('BC-2026-0003', (SELECT id FROM fournisseurs WHERE code='FRN-0003' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-15 days'), date('now','-5 days'),  'annulé',    450.00, 90.00,  540.00, 'Rupture fournisseur','BLF-2025-812','Rupture de stock chez le fournisseur', 0, '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('BC-2026-0004', (SELECT id FROM fournisseurs WHERE code='FRN-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-2 days'),  date('now','+8 days'),  'brouillon', 220.00, 44.00,  264.00, 'À valider',        NULL,          NULL,                       0, '8fd29429-3c49-4fe4-b393-6bd2fdb83094');

INSERT INTO bon_commande_lignes (bon_commande_id, produit_id, reference, designation, quantite, prix_unitaire_ht, tva, remise, prix_vente_ttc, montant_ht, montant_ttc, ordre) VALUES
-- BC-0001 (livré) — remise 5% & 10% feed the Remises page
((SELECT id FROM bons_commande WHERE numero='BC-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-001', 'Crème hydratante visage 50ml', 10, 40.00, 20, 5,  90.00,  400.00, 480.00, 0),
((SELECT id FROM bons_commande WHERE numero='BC-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-002' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-002', 'Shampoing anti-chute 250ml',   8,  50.00, 20, 10, 118.80, 400.00, 480.00, 1),
-- BC-0002 (confirmé)
((SELECT id FROM bons_commande WHERE numero='BC-2026-0002' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-005' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-005', 'Complément multivitamines 60c',10, 55.00, 20, 0,  156.00, 550.00, 660.00, 0),
-- BC-0003 (annulé)
((SELECT id FROM bons_commande WHERE numero='BC-2026-0003' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-006' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-006', 'Crème solaire SPF50 200ml',    9,  50.00, 20, 8,  144.00, 450.00, 540.00, 0),
-- BC-0004 (brouillon)
((SELECT id FROM bons_commande WHERE numero='BC-2026-0004' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-007' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-007', 'Dentifrice blancheur 75ml',    20, 11.00, 20, 0,  30.00,  220.00, 264.00, 0);

-- Bon de Livraison (supplier) linked to the delivered BC
INSERT INTO bons_livraison (numero, fournisseur_id, bon_commande_id, date_livraison, statut, montant_ht, montant_tva, montant_ttc, stock_updated, notes, user_id) VALUES
('BL-2026-0001', (SELECT id FROM fournisseurs WHERE code='FRN-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM bons_commande WHERE numero='BC-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-40 days'), 'reçu', 800.00, 160.00, 960.00, 1, 'Réception conforme', '8fd29429-3c49-4fe4-b393-6bd2fdb83094');

INSERT INTO bon_livraison_lignes (bon_livraison_id, produit_id, reference, designation, quantite, prix_unitaire_ht, tva, montant_ht, montant_ttc, ordre) VALUES
((SELECT id FROM bons_livraison WHERE numero='BL-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-001', 'Crème hydratante visage 50ml', 10, 40.00, 20, 400.00, 480.00, 0),
((SELECT id FROM bons_livraison WHERE numero='BL-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-002' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-002', 'Shampoing anti-chute 250ml',   8,  50.00, 20, 400.00, 480.00, 1);

-- Avoir fournisseur linked to the cancelled BC
INSERT INTO avoirs_fournisseur (numero, bon_commande_id, fournisseur_id, date_emission, montant_ht, montant_tva, montant_ttc, statut, notes, user_id) VALUES
('AVF-2026-0001', (SELECT id FROM bons_commande WHERE numero='BC-2026-0003' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM fournisseurs WHERE code='FRN-0003' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), date('now','-15 days'), 450.00, 90.00, 540.00, 'émis', 'Avoir généré automatiquement depuis l''annulation du Bon de Commande BC-2026-0003', '8fd29429-3c49-4fe4-b393-6bd2fdb83094');

INSERT INTO avoir_fournisseur_lignes (avoir_fournisseur_id, produit_id, reference, designation, quantite, prix_unitaire_ht, tva, montant_ht, montant_ttc, ordre) VALUES
((SELECT id FROM avoirs_fournisseur WHERE numero='AVF-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-006' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-006', 'Crème solaire SPF50 200ml', 9, 50.00, 20, 450.00, 540.00, 0);

-- ============================================================================
--  DEPENSES (expenses)
-- ============================================================================
-- `depenses.numero` has a GLOBAL UNIQUE constraint (not per-user). Remove any
-- rows with these numeros first (regardless of user), then INSERT OR IGNORE so
-- a re-run never fails on a duplicate numero.
DELETE FROM depenses WHERE numero IN ('DEP-2026-0001','DEP-2026-0002','DEP-2026-0003');
INSERT OR IGNORE INTO depenses (numero, fournisseur_id, categorie, description, date_depense, montant_ht, tva, montant_tva, montant_ttc, mode_paiement, reference_paiement, notes, user_id) VALUES
('DEP-2026-0001', (SELECT id FROM fournisseurs WHERE code='FRN-0002' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'Loyer',        'Loyer du local commercial', date('now','-30 days'), 5000.00, 20, 1000.00, 6000.00, 'Virement', 'VIR-778',  'Loyer mensuel',   '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('DEP-2026-0002', NULL,                                                                                                              'Électricité',  'Facture ONEE',              date('now','-20 days'), 800.00,  20, 160.00,  960.00,  'Prélèvement','PREL-101','Électricité',     '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('DEP-2026-0003', (SELECT id FROM fournisseurs WHERE code='FRN-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'Transport',    'Livraison marchandises',    date('now','-8 days'),  300.00,  20, 60.00,   360.00,  'Espèces',  NULL,       NULL,             '8fd29429-3c49-4fe4-b393-6bd2fdb83094');

-- ============================================================================
--  VENTES PASSAGERS (walk-in sales) — count fully in CA
-- ============================================================================
INSERT INTO ventes_passagers (numero, date, client_nom, montant_ht, montant_tva, montant_ttc, mode_paiement, cogs, notes, user_id) VALUES
('VP-2026-0001', date('now','-12 days'), 'Client comptoir', 150.00, 30.00, 180.00, 'Espèces', 80.00,  NULL, '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('VP-2026-0002', date('now','-6 days'),  'Client comptoir', 90.00,  18.00, 108.00, 'Carte',   48.00,  NULL, '8fd29429-3c49-4fe4-b393-6bd2fdb83094'),
('VP-2026-0003', date('now','-1 days'),  'Mme Karim',       210.00, 42.00, 252.00, 'Espèces', 120.00, NULL, '8fd29429-3c49-4fe4-b393-6bd2fdb83094');

INSERT INTO ventes_passagers_lignes (vente_passager_id, vp_id, produit_id, reference, designation, quantite, prix_unitaire_ht, tva, montant_ht, montant_tva, montant_ttc, ordre) VALUES
((SELECT id FROM ventes_passagers WHERE numero='VP-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM ventes_passagers WHERE numero='VP-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-004' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-004', 'Gel douche 500ml',           2, 35.00, 20, 70.00,  14.00, 84.00,  0),
((SELECT id FROM ventes_passagers WHERE numero='VP-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM ventes_passagers WHERE numero='VP-2026-0001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-007' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-007', 'Dentifrice blancheur 75ml',  1, 80.00, 20, 80.00,  16.00, 96.00,  1),
((SELECT id FROM ventes_passagers WHERE numero='VP-2026-0002' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM ventes_passagers WHERE numero='VP-2026-0002' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-001' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-001', 'Crème hydratante visage 50ml',1, 75.00, 20, 75.00,  15.00, 90.00,  0),
((SELECT id FROM ventes_passagers WHERE numero='VP-2026-0003' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM ventes_passagers WHERE numero='VP-2026-0003' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-003' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-003', 'Sérum vitamine C 30ml',       1, 160.00,20, 160.00, 32.00, 192.00, 0),
((SELECT id FROM ventes_passagers WHERE numero='VP-2026-0003' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM ventes_passagers WHERE numero='VP-2026-0003' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), (SELECT id FROM produits WHERE reference='PRD-007' AND user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094'), 'PRD-007', 'Dentifrice blancheur 75ml',   2, 25.00, 20, 50.00,  10.00, 60.00,  1);

-- ============================================================================
--  DONE. Refresh the app to see the seeded data.
--  Quick sanity check (optional): run these SELECTs afterwards.
--    SELECT statut, COUNT(*), SUM(montant_ttc) FROM factures
--      WHERE user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094' GROUP BY statut;
--    SELECT numero, statut, bl_fournisseur, motif_annulation FROM bons_commande
--      WHERE user_id='8fd29429-3c49-4fe4-b393-6bd2fdb83094';
-- ============================================================================
