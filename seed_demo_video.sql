-- ============================================================================
--  SmartGestion / ParaPharmacie — DEMO VIDEO SEED DATA
-- ============================================================================
--
--  BUT
--  ---
--  Remplir l'application avec des données réalistes et abondantes pour
--  enregistrer une vidéo de démonstration professionnelle (dashboard vivant,
--  stock coloré, factures/devis/ventes réparties sur ~6 mois).
--
--  UTILISATION
--  -----------
--  1. Connecte-toi dans l'app avec l'utilisateur :
--         651a63e3-16ee-46bb-be68-b124c220e260
--  2. Ouvre l'éditeur SQL intégré (/sql-editor), colle TOUT ce fichier,
--     puis exécute-le.
--  3. Rafraîchis l'app.
--
--  NOTES
--  -----
--  * Réexécutable : nettoie d'abord les données de cet utilisateur (CLEANUP)
--    avant de réinsérer. Syntaxe SQLite (comme seed_test.sql).
--  * Montants en DH, TVA 20% par défaut.
--  * Dates en offsets CURRENT_DATE => les filtres temporels ont des données.
--
--  LAISSÉ VIDE VOLONTAIREMENT (à faire EN DIRECT dans la vidéo) :
--    - Ajouter un nouveau produit (scène 3)
--    - Convertir le devis "accepté" DEV-2026-0006 en facture (scène 4)
--    - Faire une vente passager + imprimer le ticket (scène 5)
-- ============================================================================

-- ----------------------------------------------------------------------------
--  CLEANUP — supprime les anciennes données de cet utilisateur (idempotent)
-- ----------------------------------------------------------------------------
DELETE FROM facture_lignes             WHERE facture_id           IN (SELECT id FROM factures            WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260');
DELETE FROM devis_lignes               WHERE devis_id             IN (SELECT id FROM devis               WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260');
DELETE FROM avoir_lignes               WHERE avoir_id             IN (SELECT id FROM avoirs              WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260');
DELETE FROM bon_commande_lignes        WHERE bon_commande_id      IN (SELECT id FROM bons_commande       WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260');
DELETE FROM bon_livraison_lignes       WHERE bon_livraison_id     IN (SELECT id FROM bons_livraison      WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260');
DELETE FROM bon_livraison_client_lignes WHERE bon_livraison_client_id IN (SELECT id FROM bons_livraison_client WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260');
DELETE FROM avoir_fournisseur_lignes   WHERE avoir_fournisseur_id IN (SELECT id FROM avoirs_fournisseur  WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260');
DELETE FROM ventes_passagers_lignes    WHERE vp_id                IN (SELECT id FROM ventes_passagers    WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260');

DELETE FROM avoirs                WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260';
DELETE FROM avoirs_fournisseur    WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260';
DELETE FROM bons_livraison_client WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260';
DELETE FROM bons_livraison        WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260';
DELETE FROM factures              WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260';
DELETE FROM devis                 WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260';
DELETE FROM bons_commande         WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260';
DELETE FROM depenses              WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260';
DELETE FROM ventes_passagers      WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260';
DELETE FROM produits              WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260';
DELETE FROM clients               WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260';
DELETE FROM fournisseurs          WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260';

-- ----------------------------------------------------------------------------
--  PARAMETRES (paramètres société) — 1 ligne par utilisateur (user_id UNIQUE)
-- ----------------------------------------------------------------------------
DELETE FROM parametres WHERE user_id = '651a63e3-16ee-46bb-be68-b124c220e260';
INSERT INTO parametres (
    nom_entreprise, nom_societe, adresse, ville, code_postale, telephone, email,
    ice, rc, if_number, tp_patente, cnss, capital_social, forme_juridique,
    site_web, banque, rib, swift, devise, couleur_principale,
    conditions_paiement_defaut, pied_page_defaut,
    activer_droit_timbre, activer_filigrane, texte_filigrane, watermark_text,
    user_id
) VALUES (
    'ParaCare Casablanca SARL', 'ParaCare Casablanca SARL',
    '45 Boulevard d''Anfa, Quartier Racine', 'Casablanca', '20050',
    '+212 522 45 67 89', 'contact@paracare.ma',
    '002587413000045', 'RC 458712', 'IF 41258796', 'TP 33125478', 'CNSS 7854123',
    '250000', 'SARL', 'www.paracare.ma',
    'Attijariwafa Bank', '007 780 0001234567890123 45', 'BCMAMAMC',
    'DH', '#0EA5A4',
    'Paiement à 30 jours fin de mois', 'ParaCare Casablanca SARL — Merci de votre confiance et à bientôt.',
    1, 1, 'ParaCare', 'ParaCare',
    '651a63e3-16ee-46bb-be68-b124c220e260'
);

-- ----------------------------------------------------------------------------
--  CLIENTS (10) — pharmacies, cliniques, parapharmacies, particuliers
-- ----------------------------------------------------------------------------
INSERT INTO clients (nom, nom_societe, code, type, email, telephone, adresse, ville, code_postal, pays, ice, rc, if_identifiant, patente, notes, user_id) VALUES
('Pharmacie Al Amal',        'Pharmacie Al Amal SARL',        'CLT-0001', 'entreprise', 'contact@alamal.ma',    '+212 661 100 101', '12 Bd Zerktouni',          'Casablanca', '20100', 'Maroc', '001456789000032', 'RC 210014', 'IF 5100141', 'TP 700141', 'Client fidèle depuis 2019',  '651a63e3-16ee-46bb-be68-b124c220e260'),
('Clinique Ibn Sina',        'Clinique Ibn Sina',             'CLT-0002', 'entreprise', 'achats@ibnsina.ma',    '+212 662 200 202', '18 Av. Hassan II',         'Rabat',      '10000', 'Maroc', '001456789000049', 'RC 210020', 'IF 5100205', 'TP 700205', 'Commandes régulières',       '651a63e3-16ee-46bb-be68-b124c220e260'),
('Parapharmacie Nour',       'Parapharmacie Nour',            'CLT-0003', 'entreprise', 'nour@parapharma.ma',   '+212 663 300 303', '2 Rue de Fès, Gueliz',     'Marrakech',  '40000', 'Maroc', '001456789000056', 'RC 210033', 'IF 5100338', 'TP 700338', NULL,                         '651a63e3-16ee-46bb-be68-b124c220e260'),
('Centre Médical Atlas',     'Centre Médical Atlas',          'CLT-0004', 'entreprise', 'atlas@medical.ma',     '+212 664 400 404', '44 Bd Mohammed V',         'Tanger',     '90000', 'Maroc', '001456789000063', 'RC 210044', 'IF 5100447', 'TP 700447', 'Paiement par virement',      '651a63e3-16ee-46bb-be68-b124c220e260'),
('Pharmacie Zerktouni',      'Pharmacie Zerktouni',           'CLT-0005', 'entreprise', 'zerktouni@pharma.ma',  '+212 665 500 505', '101 Bd Zerktouni',         'Casablanca', '20250', 'Maroc', '001456789000070', 'RC 210055', 'IF 5100554', 'TP 700554', NULL,                         '651a63e3-16ee-46bb-be68-b124c220e260'),
('Parapharmacie Océane',     'Parapharmacie Océane',          'CLT-0006', 'entreprise', 'oceane@para.ma',       '+212 666 600 606', '7 Av. des FAR',            'Agadir',     '80000', 'Maroc', '001456789000087', 'RC 210066', 'IF 5100665', 'TP 700665', 'Client premium',             '651a63e3-16ee-46bb-be68-b124c220e260'),
('Clinique Al Andalous',     'Clinique Al Andalous',          'CLT-0007', 'entreprise', 'andalous@clinique.ma', '+212 667 700 707', '30 Rue Ibn Batouta',       'Fès',        '30000', 'Maroc', '001456789000094', 'RC 210077', 'IF 5100776', 'TP 700776', NULL,                         '651a63e3-16ee-46bb-be68-b124c220e260'),
('Mme Fatima Zahra Bennani', NULL,                            'CLT-0008', 'particulier','fz.bennani@mail.ma',   '+212 668 800 808', 'Résidence Al Fajr, Apt 12','Casablanca', '20300', 'Maroc', NULL,              NULL,        NULL,         NULL,        'Cliente particulière',       '651a63e3-16ee-46bb-be68-b124c220e260'),
('M. Youssef El Idrissi',    NULL,                            'CLT-0009', 'particulier','y.elidrissi@mail.ma',  '+212 669 900 909', '5 Rue de la Liberté',      'Rabat',      '10010', 'Maroc', NULL,              NULL,        NULL,         NULL,        NULL,                         '651a63e3-16ee-46bb-be68-b124c220e260'),
('Pharmacie du Centre',      'Pharmacie du Centre',           'CLT-0010', 'entreprise', 'centre@pharma.ma',     '+212 661 010 110', '88 Av. Mohammed VI',       'Meknès',     '50000', 'Maroc', '001456789000100', 'RC 210088', 'IF 5100887', 'TP 700887', 'Nouveau client',             '651a63e3-16ee-46bb-be68-b124c220e260');

-- ----------------------------------------------------------------------------
--  FOURNISSEURS (5)
-- ----------------------------------------------------------------------------
INSERT INTO fournisseurs (nom, nom_societe, code, type, contact, email, telephone, adresse, ville, code_postale, ice, notes, user_id) VALUES
('Cosmétique Distribution Maroc', 'Cosmétique Distribution Maroc', 'FRN-0001', 'entreprise', 'M. Alaoui',   'commandes@cosmedist.ma',  '+212 522 10 10 10', 'Zone Ind. Sidi Bernoussi', 'Casablanca', '20600', '003125478000011', 'Livraison sous 48h',      '651a63e3-16ee-46bb-be68-b124c220e260'),
('Distri Pharma Plus',            'Distri Pharma Plus',            'FRN-0002', 'entreprise', 'Mme Bennani', 'contact@distripharma.ma', '+212 537 20 20 20', '7 Av. des FAR',            'Rabat',      '10010', '003125478000028', NULL,                      '651a63e3-16ee-46bb-be68-b124c220e260'),
('Import Santé Beauté',           'Import Santé Beauté',           'FRN-0003', 'entreprise', 'M. Tazi',     'info@importsante.ma',     '+212 524 30 30 30', '9 Rue Ibn Toumert',        'Marrakech',  '40010', '003125478000035', 'Produits premium importés','651a63e3-16ee-46bb-be68-b124c220e260'),
('Laboratoires Derma Maroc',      'Laboratoires Derma Maroc',      'FRN-0004', 'entreprise', 'Dr. Fassi',   'labo@dermamaroc.ma',      '+212 522 40 40 40', '22 Zone Franche',          'Tanger',     '90010', '003125478000042', 'Dermo-cosmétique',        '651a63e3-16ee-46bb-be68-b124c220e260'),
('Nature & Bio Sourcing',         'Nature & Bio Sourcing',         'FRN-0005', 'entreprise', 'Mme Saidi',   'bio@naturebio.ma',        '+212 528 50 50 50', 'Route d''Essaouira',       'Agadir',     '80010', '003125478000059', 'Produits bio et naturels','651a63e3-16ee-46bb-be68-b124c220e260');

-- ----------------------------------------------------------------------------
--  PRODUITS (30) — marques réelles, catégories variées.
--  STOCK VOLONTAIREMENT VARIÉ pour un dashboard/stock vivant :
--    * stock_actuel = 0            -> RUPTURE (rouge)
--    * stock_actuel < stock_min    -> CRITIQUE / FAIBLE (orange)
--    * stock_actuel >= stock_min   -> STABLE (vert)
-- ----------------------------------------------------------------------------
INSERT INTO produits (reference, designation, nom, categorie, marque, barcode, prix_achat_ht, prix_vente_ht, tva, taux_tva, prix_achat_ttc, prix_vente_ttc, stock_actuel, stock_min, unite, calc_vente_ttc, calc_remise, is_active, user_id) VALUES
-- Soins visage
('PRD-001', 'Crème hydratante Hydrabio 40ml',      'Crème hydratante Hydrabio 40ml',      'Soins visage', 'Bioderma',       '6111100000011', 95.00,  165.00, 20, 20, 114.00, 198.00, 64,  15, 'unité',  198.00, 5,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-002', 'Sérum Vitamine C 30ml',               'Sérum Vitamine C 30ml',               'Soins visage', 'La Roche-Posay', '6111100000028', 120.00, 210.00, 20, 20, 144.00, 252.00, 38,  10, 'unité',  252.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-003', 'Eau thermale spray 300ml',            'Eau thermale spray 300ml',            'Soins visage', 'Avène',          '6111100000035', 55.00,  99.00,  20, 20, 66.00,  118.80, 120, 20, 'unité',  118.80, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-004', 'Crème anti-âge Liftactiv 50ml',       'Crème anti-âge Liftactiv 50ml',       'Soins visage', 'Vichy',          '6111100000042', 180.00, 320.00, 20, 20, 216.00, 384.00, 4,   10, 'unité',  384.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-005', 'Nettoyant moussant purifiant 150ml',  'Nettoyant moussant purifiant 150ml',  'Soins visage', 'Uriage',         '6111100000059', 60.00,  110.00, 20, 20, 72.00,  132.00, 52,  15, 'unité',  132.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
-- Solaire
('PRD-006', 'Crème solaire SPF50+ 200ml',          'Crème solaire SPF50+ 200ml',          'Solaire',      'Avène',          '6111100000066', 85.00,  150.00, 20, 20, 102.00, 180.00, 45,  12, 'unité',  180.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-007', 'Spray solaire enfant SPF50 200ml',    'Spray solaire enfant SPF50 200ml',    'Solaire',      'La Roche-Posay', '6111100000073', 90.00,  160.00, 20, 20, 108.00, 192.00, 0,   10, 'unité',  192.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-008', 'Après-soleil apaisant 200ml',         'Après-soleil apaisant 200ml',         'Solaire',      'Bioderma',       '6111100000080', 50.00,  90.00,  20, 20, 60.00,  108.00, 33,  10, 'unité',  108.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
-- Cheveux
('PRD-009', 'Shampoing anti-chute 200ml',          'Shampoing anti-chute 200ml',          'Cheveux',      'Vichy',          '6111100000097', 75.00,  135.00, 20, 20, 90.00,  162.00, 58,  15, 'unité',  162.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-010', 'Ampoules anti-chute (x21)',           'Ampoules anti-chute (x21)',           'Cheveux',      'Ducray',         '6111100000103', 160.00, 285.00, 20, 20, 192.00, 342.00, 3,   8,  'boîte',  342.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-011', 'Shampoing antipelliculaire 200ml',    'Shampoing antipelliculaire 200ml',    'Cheveux',      'Kelual DS',      '6111100000110', 65.00,  120.00, 20, 20, 78.00,  144.00, 41,  12, 'unité',  144.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-012', 'Huile réparatrice cheveux 100ml',     'Huile réparatrice cheveux 100ml',     'Cheveux',      'Nuxe',           '6111100000127', 110.00, 195.00, 20, 20, 132.00, 234.00, 27,  10, 'flacon', 234.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
-- Bébé & Maman
('PRD-013', 'Liniment bébé 500ml',                 'Liniment bébé 500ml',                 'Bébé & Maman', 'Mustela',        '6111100000134', 45.00,  85.00,  20, 20, 54.00,  102.00, 90,  20, 'flacon', 102.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-014', 'Crème change bébé 100ml',             'Crème change bébé 100ml',             'Bébé & Maman', 'Mustela',        '6111100000141', 55.00,  99.00,  20, 20, 66.00,  118.80, 62,  15, 'unité',  118.80, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-015', 'Lingettes bébé (x70)',                'Lingettes bébé (x70)',                'Bébé & Maman', 'Uriage',         '6111100000158', 22.00,  42.00,  20, 20, 26.40,  50.40,  150, 30, 'paquet', 50.40,  0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-016', 'Crème vergetures maternité 150ml',    'Crème vergetures maternité 150ml',    'Bébé & Maman', 'Mustela',        '6111100000165', 95.00,  175.00, 20, 20, 114.00, 210.00, 6,   10, 'unité',  210.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
-- Compléments alimentaires
('PRD-017', 'Multivitamines 60 comprimés',         'Multivitamines 60 comprimés',         'Compléments',  'Bion3',          '6111100000172', 85.00,  155.00, 20, 20, 102.00, 186.00, 48,  15, 'boîte',  186.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-018', 'Magnésium B6 (x60)',                  'Magnésium B6 (x60)',                  'Compléments',  'Magne B6',       '6111100000189', 40.00,  75.00,  20, 20, 48.00,  90.00,  70,  20, 'boîte',  90.00,  0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-019', 'Vitamine D3 gouttes 10ml',            'Vitamine D3 gouttes 10ml',            'Compléments',  'ZymaD',          '6111100000196', 25.00,  48.00,  20, 20, 30.00,  57.60,  2,   10, 'flacon', 57.60,  0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-020', 'Oméga 3 (x120)',                      'Oméga 3 (x120)',                      'Compléments',  'Omacor',         '6111100000202', 130.00, 235.00, 20, 20, 156.00, 282.00, 21,  10, 'boîte',  282.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
-- Hygiène
('PRD-021', 'Gel douche surgras 500ml',            'Gel douche surgras 500ml',            'Hygiène',      'Eucerin',        '6111100000219', 45.00,  82.00,  20, 20, 54.00,  98.40,  110, 25, 'unité',  98.40,  0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-022', 'Dentifrice blancheur 75ml',           'Dentifrice blancheur 75ml',           'Hygiène',      'Sensodyne',      '6111100000226', 18.00,  35.00,  20, 20, 21.60,  42.00,  180, 30, 'unité',  42.00,  0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-023', 'Bain de bouche 500ml',                'Bain de bouche 500ml',                'Hygiène',      'Listerine',      '6111100000233', 28.00,  52.00,  20, 20, 33.60,  62.40,  95,  20, 'unité',  62.40,  0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-024', 'Déodorant soin 48h roll-on 50ml',     'Déodorant soin 48h roll-on 50ml',     'Hygiène',      'Vichy',          '6111100000240', 32.00,  60.00,  20, 20, 38.40,  72.00,  75,  20, 'unité',  72.00,  0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
-- Soins corps / Bio
('PRD-025', 'Huile d''argan bio 100ml',            'Huile d''argan bio 100ml',            'Soins corps',  'Bio Argan',      '6111100000257', 50.00,  95.00,  20, 20, 60.00,  114.00, 5,   12, 'flacon', 114.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-026', 'Beurre de karité bio 200ml',          'Beurre de karité bio 200ml',          'Soins corps',  'Nature & Bio',   '6111100000264', 40.00,  78.00,  20, 20, 48.00,  93.60,  44,  10, 'pot',    93.60,  0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-027', 'Crème mains réparatrice 75ml',        'Crème mains réparatrice 75ml',        'Soins corps',  'Neutrogena',     '6111100000271', 22.00,  42.00,  20, 20, 26.40,  50.40,  130, 25, 'unité',  50.40,  0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
-- Minceur & divers
('PRD-028', 'Gel minceur cellulite 200ml',         'Gel minceur cellulite 200ml',         'Minceur',      'Somatoline',     '6111100000288', 140.00, 250.00, 20, 20, 168.00, 300.00, 18,  10, 'unité',  300.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-029', 'Thé minceur détox (x20 sachets)',     'Thé minceur détox (x20 sachets)',     'Minceur',      'Arkopharma',     '6111100000295', 35.00,  68.00,  20, 20, 42.00,  81.60,  60,  15, 'boîte',  81.60,  0,  1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('PRD-030', 'Patchs anti-cernes (x10)',            'Patchs anti-cernes (x10)',            'Soins visage', 'Nuxe',           '6111100000301', 48.00,  90.00,  20, 20, 57.60,  108.00, 0,   8,  'boîte',  108.00, 0,  1, '651a63e3-16ee-46bb-be68-b124c220e260');

-- ============================================================================
--  DEVIS (6) — statuts variés.
--  DEV-2026-0006 est "accepté" et NON encore converti => à convertir EN DIRECT
--  dans la vidéo (scène 4).
-- ============================================================================
INSERT INTO devis (numero, client_id, date_emission, date_validite, statut, montant_ht, montant_tva, montant_ttc, notes, conditions_paiement, mode_paiement, user_id) VALUES
('DEV-2026-0001', (SELECT id FROM clients WHERE code='CLT-0002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), date('now','-55 days'), date('now','-25 days'), 'accepté',   1650.00, 330.00, 1980.00, 'Devis accepté et facturé',  'Paiement à 30 jours', 'Virement', '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEV-2026-0002', (SELECT id FROM clients WHERE code='CLT-0003' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), date('now','-30 days'), date('now','+10 days'), 'envoyé',    920.00,  184.00, 1104.00, 'En attente de réponse',     'Paiement à 30 jours', 'Chèque',   '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEV-2026-0003', (SELECT id FROM clients WHERE code='CLT-0006' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), date('now','-18 days'), date('now','+12 days'), 'envoyé',    2340.00, 468.00, 2808.00, 'Devis premium',             'Paiement à 30 jours', 'Virement', '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEV-2026-0004', (SELECT id FROM clients WHERE code='CLT-0007' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), date('now','-12 days'), date('now','-2 days'),  'refusé',    600.00,  120.00, 720.00,  'Refusé — budget',           'Paiement comptant',   'Espèces',  '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEV-2026-0005', (SELECT id FROM clients WHERE code='CLT-0010' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), date('now','-4 days'),  date('now','+26 days'), 'brouillon', 480.00,  96.00,  576.00,  'Brouillon en cours',        'Paiement comptant',   'Espèces',  '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEV-2026-0006', (SELECT id FROM clients WHERE code='CLT-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), date('now','-2 days'),  date('now','+28 days'), 'accepté',   1245.00, 249.00, 1494.00, 'À convertir en facture',    'Paiement à 30 jours', 'Virement', '651a63e3-16ee-46bb-be68-b124c220e260');

INSERT INTO devis_lignes (devis_id, produit_id, reference, designation, quantite, prix_unitaire_ht, tva, remise, prix_vente_ttc, montant_ht, montant_tva, montant_ttc, ordre) VALUES
-- DEV-0001 (accepté, déjà facturé)
((SELECT id FROM devis WHERE numero='DEV-2026-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-002', 'Sérum Vitamine C 30ml',          5, 210.00, 20, 0, 252.00, 1050.00, 210.00, 1260.00, 0),
((SELECT id FROM devis WHERE numero='DEV-2026-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-006' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-006', 'Crème solaire SPF50+ 200ml',     4, 150.00, 20, 0, 180.00, 600.00,  120.00, 720.00,  1),
-- DEV-0002 (envoyé)
((SELECT id FROM devis WHERE numero='DEV-2026-0002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-009' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-009', 'Shampoing anti-chute 200ml',     4, 135.00, 20, 0, 162.00, 540.00,  108.00, 648.00,  0),
((SELECT id FROM devis WHERE numero='DEV-2026-0002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-012' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-012', 'Huile réparatrice cheveux 100ml',2, 195.00, 20, 0, 234.00, 380.00,  76.00,  456.00,  1),
-- DEV-0003 (envoyé, premium)
((SELECT id FROM devis WHERE numero='DEV-2026-0003' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-004' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-004', 'Crème anti-âge Liftactiv 50ml',  5, 320.00, 20, 0, 384.00, 1600.00, 320.00, 1920.00, 0),
((SELECT id FROM devis WHERE numero='DEV-2026-0003' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-028' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-028', 'Gel minceur cellulite 200ml',    3, 250.00, 20, 2, 300.00, 740.00,  148.00, 888.00,  1),
-- DEV-0004 (refusé)
((SELECT id FROM devis WHERE numero='DEV-2026-0004' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-017' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-017', 'Multivitamines 60 comprimés',    4, 155.00, 20, 0, 186.00, 620.00,  124.00, 744.00,  0),
-- DEV-0005 (brouillon)
((SELECT id FROM devis WHERE numero='DEV-2026-0005' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-013' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-013', 'Liniment bébé 500ml',            4, 85.00,  20, 0, 102.00, 340.00,  68.00,  408.00,  0),
-- DEV-0006 (accepté — À CONVERTIR EN DIRECT)
((SELECT id FROM devis WHERE numero='DEV-2026-0006' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-001', 'Crème hydratante Hydrabio 40ml', 5, 165.00, 20, 0, 198.00, 825.00,  165.00, 990.00,  0),
((SELECT id FROM devis WHERE numero='DEV-2026-0006' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-020' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-020', 'Oméga 3 (x120)',                 2, 210.00, 20, 0, 282.00, 420.00,  84.00,  504.00,  1);

-- ============================================================================
--  FACTURES (15) — réparties sur ~6 mois. Statuts variés pour un CA riche.
--    payée         -> compte dans le CA
--    reste_a_payer -> compte dans le CA + Créances
--    en_attente    -> hors CA
--    brouillon     -> hors CA
--  stock_updated = 1 pour payée / reste_a_payer.
-- ============================================================================
INSERT INTO factures (numero, client_id, devis_id, date_emission, date_echeance, statut, mode_paiement, montant_ht, montant_tva, montant_ttc, reste_a_payer, cogs, stock_updated, notes, conditions_paiement, user_id) VALUES
('FAC-2026-0001', (SELECT id FROM clients WHERE code='CLT-0002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM devis WHERE numero='DEV-2026-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), date('now','-170 days'), date('now','-140 days'), 'payée',        'Virement', 1650.00, 330.00, 1980.00, 0.00,    900.00,  1, 'Issue du devis DEV-2026-0001', 'Paiement à 30 jours', '651a63e3-16ee-46bb-be68-b124c220e260'),
('FAC-2026-0002', (SELECT id FROM clients WHERE code='CLT-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), NULL, date('now','-155 days'), date('now','-125 days'), 'payée',        'Chèque',   2340.00, 468.00, 2808.00, 0.00,    1300.00, 1, NULL,                           'Paiement à 30 jours', '651a63e3-16ee-46bb-be68-b124c220e260'),
('FAC-2026-0003', (SELECT id FROM clients WHERE code='CLT-0004' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), NULL, date('now','-140 days'), date('now','-110 days'), 'payée',        'Virement', 1120.00, 224.00, 1344.00, 0.00,    620.00,  1, NULL,                           'Paiement à 30 jours', '651a63e3-16ee-46bb-be68-b124c220e260'),
('FAC-2026-0004', (SELECT id FROM clients WHERE code='CLT-0005' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), NULL, date('now','-120 days'), date('now','-90 days'),  'payée',        'Espèces',  760.00,  152.00, 912.00,  0.00,    410.00,  1, NULL,                           'Paiement comptant',   '651a63e3-16ee-46bb-be68-b124c220e260'),
('FAC-2026-0005', (SELECT id FROM clients WHERE code='CLT-0003' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), NULL, date('now','-105 days'), date('now','-75 days'),  'payée',        'Virement', 1980.00, 396.00, 2376.00, 0.00,    1080.00, 1, NULL,                           'Paiement à 30 jours', '651a63e3-16ee-46bb-be68-b124c220e260'),
('FAC-2026-0006', (SELECT id FROM clients WHERE code='CLT-0006' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), NULL, date('now','-88 days'),  date('now','-58 days'),  'payée',        'Chèque',   3100.00, 620.00, 3720.00, 0.00,    1720.00, 1, 'Grande commande',              'Paiement à 30 jours', '651a63e3-16ee-46bb-be68-b124c220e260'),
('FAC-2026-0007', (SELECT id FROM clients WHERE code='CLT-0007' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), NULL, date('now','-70 days'),  date('now','-40 days'),  'payée',        'Virement', 890.00,  178.00, 1068.00, 0.00,    480.00,  1, NULL,                           'Paiement à 30 jours', '651a63e3-16ee-46bb-be68-b124c220e260'),
('FAC-2026-0008', (SELECT id FROM clients WHERE code='CLT-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), NULL, date('now','-55 days'),  date('now','-25 days'),  'payée',        'Espèces',  1450.00, 290.00, 1740.00, 0.00,    790.00,  1, NULL,                           'Paiement à 30 jours', '651a63e3-16ee-46bb-be68-b124c220e260'),
('FAC-2026-0009', (SELECT id FROM clients WHERE code='CLT-0002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), NULL, date('now','-40 days'),  date('now','-10 days'),  'payée',        'Virement', 2650.00, 530.00, 3180.00, 0.00,    1450.00, 1, NULL,                           'Paiement à 30 jours', '651a63e3-16ee-46bb-be68-b124c220e260'),
('FAC-2026-0010', (SELECT id FROM clients WHERE code='CLT-0010' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), NULL, date('now','-30 days'),  date('now','0 days'),    'payée',        'Chèque',   1230.00, 246.00, 1476.00, 0.00,    670.00,  1, NULL,                           'Paiement à 30 jours', '651a63e3-16ee-46bb-be68-b124c220e260'),
('FAC-2026-0011', (SELECT id FROM clients WHERE code='CLT-0005' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), NULL, date('now','-22 days'),  date('now','+8 days'),   'reste_a_payer','Virement', 1875.00, 375.00, 2250.00, 1000.00, 1020.00, 1, 'Acompte de 1250 DH reçu',     'Paiement à 30 jours', '651a63e3-16ee-46bb-be68-b124c220e260'),
('FAC-2026-0012', (SELECT id FROM clients WHERE code='CLT-0003' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), NULL, date('now','-15 days'),  date('now','+15 days'),  'reste_a_payer','Chèque',   980.00,  196.00, 1176.00, 576.00,  530.00,  1, 'Reste à régler',              'Paiement à 30 jours', '651a63e3-16ee-46bb-be68-b124c220e260'),
('FAC-2026-0013', (SELECT id FROM clients WHERE code='CLT-0006' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), NULL, date('now','-9 days'),   date('now','+21 days'),  'en_attente',   'Virement', 1560.00, 312.00, 1872.00, 1872.00, 0.00,    0, 'En attente de paiement',      'Paiement à 30 jours', '651a63e3-16ee-46bb-be68-b124c220e260'),
('FAC-2026-0014', (SELECT id FROM clients WHERE code='CLT-0008' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), NULL, date('now','-5 days'),   date('now','+25 days'),  'en_attente',   'Espèces',  420.00,  84.00,  504.00,  504.00,  0.00,    0, NULL,                          'Paiement comptant',   '651a63e3-16ee-46bb-be68-b124c220e260'),
('FAC-2026-0015', (SELECT id FROM clients WHERE code='CLT-0004' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), NULL, date('now','-2 days'),   date('now','+28 days'),  'brouillon',    'Virement', 350.00,  70.00,  420.00,  420.00,  0.00,    0, 'Brouillon',                   'Paiement à 30 jours', '651a63e3-16ee-46bb-be68-b124c220e260');

INSERT INTO facture_lignes (facture_id, produit_id, reference, designation, quantite, prix_unitaire_ht, tva, remise, prix_vente_ttc, montant_ht, montant_ttc, ordre) VALUES
-- FAC-0001
((SELECT id FROM factures WHERE numero='FAC-2026-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-002', 'Sérum Vitamine C 30ml',          5, 210.00, 20, 0, 252.00, 1050.00, 1260.00, 0),
((SELECT id FROM factures WHERE numero='FAC-2026-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-006' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-006', 'Crème solaire SPF50+ 200ml',     4, 150.00, 20, 0, 180.00, 600.00,  720.00,  1),
-- FAC-0002
((SELECT id FROM factures WHERE numero='FAC-2026-0002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-004' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-004', 'Crème anti-âge Liftactiv 50ml',  6, 320.00, 20, 0, 384.00, 1920.00, 2304.00, 0),
((SELECT id FROM factures WHERE numero='FAC-2026-0002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-024' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-024', 'Déodorant soin 48h roll-on 50ml',7, 60.00,  20, 0, 72.00,  420.00,  504.00,  1),
-- FAC-0003
((SELECT id FROM factures WHERE numero='FAC-2026-0003' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-009' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-009', 'Shampoing anti-chute 200ml',     6, 135.00, 20, 0, 162.00, 810.00,  972.00,  0),
((SELECT id FROM factures WHERE numero='FAC-2026-0003' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-011' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-011', 'Shampoing antipelliculaire 200ml',3, 120.00, 20, 0, 144.00, 360.00,  432.00,  1),
-- FAC-0004
((SELECT id FROM factures WHERE numero='FAC-2026-0004' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-013' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-013', 'Liniment bébé 500ml',            5, 85.00,  20, 0, 102.00, 425.00,  510.00,  0),
((SELECT id FROM factures WHERE numero='FAC-2026-0004' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-015' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-015', 'Lingettes bébé (x70)',           8, 42.00,  20, 0, 50.40,  335.00,  402.00,  1),
-- FAC-0005
((SELECT id FROM factures WHERE numero='FAC-2026-0005' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-028' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-028', 'Gel minceur cellulite 200ml',    5, 250.00, 20, 0, 300.00, 1250.00, 1500.00, 0),
((SELECT id FROM factures WHERE numero='FAC-2026-0005' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-020' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-020', 'Oméga 3 (x120)',                 3, 235.00, 20, 0, 282.00, 705.00,  846.00,  1),
-- FAC-0006
((SELECT id FROM factures WHERE numero='FAC-2026-0006' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-002', 'Sérum Vitamine C 30ml',          8, 210.00, 20, 0, 252.00, 1680.00, 2016.00, 0),
((SELECT id FROM factures WHERE numero='FAC-2026-0006' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-001', 'Crème hydratante Hydrabio 40ml', 8, 165.00, 20, 0, 198.00, 1320.00, 1584.00, 1),
-- FAC-0007
((SELECT id FROM factures WHERE numero='FAC-2026-0007' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-017' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-017', 'Multivitamines 60 comprimés',    4, 155.00, 20, 0, 186.00, 620.00,  744.00,  0),
((SELECT id FROM factures WHERE numero='FAC-2026-0007' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-018' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-018', 'Magnésium B6 (x60)',             3, 75.00,  20, 0, 90.00,  270.00,  324.00,  1),
-- FAC-0008
((SELECT id FROM factures WHERE numero='FAC-2026-0008' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-012' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-012', 'Huile réparatrice cheveux 100ml',5, 195.00, 20, 0, 234.00, 975.00,  1170.00, 0),
((SELECT id FROM factures WHERE numero='FAC-2026-0008' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-021' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-021', 'Gel douche surgras 500ml',       10,47.50, 20, 0, 98.40,  475.00,  570.00,  1),
-- FAC-0009
((SELECT id FROM factures WHERE numero='FAC-2026-0009' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-004' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-004', 'Crème anti-âge Liftactiv 50ml',  6, 320.00, 20, 0, 384.00, 1920.00, 2304.00, 0),
((SELECT id FROM factures WHERE numero='FAC-2026-0009' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-006' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-006', 'Crème solaire SPF50+ 200ml',     5, 146.00, 20, 0, 180.00, 730.00,  876.00,  1),
-- FAC-0010
((SELECT id FROM factures WHERE numero='FAC-2026-0010' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-026' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-026', 'Beurre de karité bio 200ml',     10,78.00,  20, 0, 93.60,  780.00,  936.00,  0),
((SELECT id FROM factures WHERE numero='FAC-2026-0010' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-025' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-025', 'Huile d''argan bio 100ml',       5, 90.00,  20, 0, 114.00, 450.00,  540.00,  1),
-- FAC-0011 (reste_a_payer)
((SELECT id FROM factures WHERE numero='FAC-2026-0011' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-028' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-028', 'Gel minceur cellulite 200ml',    5, 250.00, 20, 0, 300.00, 1250.00, 1500.00, 0),
((SELECT id FROM factures WHERE numero='FAC-2026-0011' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-010' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-010', 'Ampoules anti-chute (x21)',      2, 312.50, 20, 0, 342.00, 625.00,  750.00,  1),
-- FAC-0012 (reste_a_payer)
((SELECT id FROM factures WHERE numero='FAC-2026-0012' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-009' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-009', 'Shampoing anti-chute 200ml',     4, 135.00, 20, 0, 162.00, 540.00,  648.00,  0),
((SELECT id FROM factures WHERE numero='FAC-2026-0012' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-014' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-014', 'Crème change bébé 100ml',        4, 110.00, 20, 0, 118.80, 440.00,  528.00,  1),
-- FAC-0013 (en_attente)
((SELECT id FROM factures WHERE numero='FAC-2026-0013' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-020' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-020', 'Oméga 3 (x120)',                 4, 235.00, 20, 0, 282.00, 940.00,  1128.00, 0),
((SELECT id FROM factures WHERE numero='FAC-2026-0013' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-016' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-016', 'Crème vergetures maternité 150ml',3,175.00, 20, 0, 210.00, 525.00,  630.00,  1),
-- FAC-0014 (en_attente)
((SELECT id FROM factures WHERE numero='FAC-2026-0014' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-029' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-029', 'Thé minceur détox (x20 sachets)',4, 68.00,  20, 0, 81.60,  272.00,  326.40,  0),
((SELECT id FROM factures WHERE numero='FAC-2026-0014' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-023' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-023', 'Bain de bouche 500ml',           3, 52.00,  20, 0, 62.40,  156.00,  187.20,  1),
-- FAC-0015 (brouillon)
((SELECT id FROM factures WHERE numero='FAC-2026-0015' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-027' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-027', 'Crème mains réparatrice 75ml',   5, 42.00,  20, 0, 50.40,  210.00,  252.00,  0),
((SELECT id FROM factures WHERE numero='FAC-2026-0015' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-022' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-022', 'Dentifrice blancheur 75ml',      4, 35.00,  20, 0, 42.00,  140.00,  168.00,  1);

-- Bon de Livraison Client lié à une facture payée
INSERT INTO bons_livraison_client (numero, client_id, facture_id, date_livraison, statut, montant_ht, montant_tva, montant_ttc, notes, user_id) VALUES
('BLC-2026-0001', (SELECT id FROM clients WHERE code='CLT-0002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM factures WHERE numero='FAC-2026-0009' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), date('now','-39 days'), 'livré', 2650.00, 530.00, 3180.00, 'Bon de livraison pour FAC-2026-0009', '651a63e3-16ee-46bb-be68-b124c220e260');

INSERT INTO bon_livraison_client_lignes (bon_livraison_client_id, produit_id, reference, designation, quantite, prix_unitaire_ht, tva, remise, prix_vente_ttc, montant_ht, montant_ttc, ordre) VALUES
((SELECT id FROM bons_livraison_client WHERE numero='BLC-2026-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-004' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-004', 'Crème anti-âge Liftactiv 50ml', 6, 320.00, 20, 0, 384.00, 1920.00, 2304.00, 0),
((SELECT id FROM bons_livraison_client WHERE numero='BLC-2026-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-006' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-006', 'Crème solaire SPF50+ 200ml',    5, 146.00, 20, 0, 180.00, 730.00,  876.00,  1);

-- ============================================================================
--  AVOIR (1) — note de crédit client
-- ============================================================================
INSERT INTO avoirs (numero, facture_id, client_id, date_emission, motif, montant_ht, montant_tva, montant_ttc, statut, notes, user_id) VALUES
('AV-2026-0001', (SELECT id FROM factures WHERE numero='FAC-2026-0007' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM clients WHERE code='CLT-0007' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), date('now','-60 days'), 'Retour produit défectueux', 155.00, 31.00, 186.00, 'Généré', 'Avoir pour retour 1 boîte multivitamines', '651a63e3-16ee-46bb-be68-b124c220e260');

INSERT INTO avoir_lignes (avoir_id, produit_id, reference, designation, quantite, prix_unitaire_ht, tva, montant_ht, montant_ttc, ordre) VALUES
((SELECT id FROM avoirs WHERE numero='AV-2026-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-017' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-017', 'Multivitamines 60 comprimés', 1, 155.00, 20, 155.00, 186.00, 0);

-- ============================================================================
--  BONS DE COMMANDE (4) — avec remises (feed page Remises) + statuts variés
-- ============================================================================
INSERT INTO bons_commande (numero, fournisseur_id, date_commande, date_livraison_prevue, statut, montant_ht, montant_tva, montant_ttc, notes, bl_fournisseur, motif_annulation, stock_updated, user_id) VALUES
('BC-2026-0001', (SELECT id FROM fournisseurs WHERE code='FRN-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), date('now','-95 days'), date('now','-85 days'), 'livré',     3200.00, 640.00, 3840.00, 'Réappro soins visage', 'BLF-2025-1120', NULL,                    1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('BC-2026-0002', (SELECT id FROM fournisseurs WHERE code='FRN-0004' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), date('now','-60 days'), date('now','-50 days'), 'livré',     2100.00, 420.00, 2520.00, 'Réappro dermo',        'BLF-2025-1198', NULL,                    1, '651a63e3-16ee-46bb-be68-b124c220e260'),
('BC-2026-0003', (SELECT id FROM fournisseurs WHERE code='FRN-0002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), date('now','-25 days'), date('now','-15 days'), 'confirmé',  1500.00, 300.00, 1800.00, 'Commande confirmée',   NULL,           NULL,                    0, '651a63e3-16ee-46bb-be68-b124c220e260'),
('BC-2026-0004', (SELECT id FROM fournisseurs WHERE code='FRN-0003' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), date('now','-6 days'),  date('now','+6 days'),  'brouillon', 950.00,  190.00, 1140.00, 'À valider',            NULL,           NULL,                    0, '651a63e3-16ee-46bb-be68-b124c220e260');

INSERT INTO bon_commande_lignes (bon_commande_id, produit_id, reference, designation, quantite, prix_unitaire_ht, tva, remise, prix_vente_ttc, montant_ht, montant_ttc, ordre) VALUES
-- BC-0001 (livré) — remises 5% & 10%
((SELECT id FROM bons_commande WHERE numero='BC-2026-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-001', 'Crème hydratante Hydrabio 40ml', 20, 95.00,  20, 5,  198.00, 1900.00, 2280.00, 0),
((SELECT id FROM bons_commande WHERE numero='BC-2026-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-002', 'Sérum Vitamine C 30ml',          10, 130.00, 20, 10, 252.00, 1300.00, 1560.00, 1),
-- BC-0002 (livré)
((SELECT id FROM bons_commande WHERE numero='BC-2026-0002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-004' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-004', 'Crème anti-âge Liftactiv 50ml',  10, 180.00, 20, 8,  384.00, 1800.00, 2160.00, 0),
((SELECT id FROM bons_commande WHERE numero='BC-2026-0002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-009' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-009', 'Shampoing anti-chute 200ml',     4,  75.00,  20, 0,  162.00, 300.00,  360.00,  1),
-- BC-0003 (confirmé)
((SELECT id FROM bons_commande WHERE numero='BC-2026-0003' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-013' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-013', 'Liniment bébé 500ml',            20, 45.00,  20, 0,  102.00, 900.00,  1080.00, 0),
((SELECT id FROM bons_commande WHERE numero='BC-2026-0003' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-015' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-015', 'Lingettes bébé (x70)',           27, 22.00,  20, 0,  50.40,  600.00,  720.00,  1),
-- BC-0004 (brouillon)
((SELECT id FROM bons_commande WHERE numero='BC-2026-0004' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-025' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-025', 'Huile d''argan bio 100ml',       19, 50.00,  20, 0,  114.00, 950.00,  1140.00, 0);

-- Bon de Livraison (fournisseur) lié au BC livré
INSERT INTO bons_livraison (numero, fournisseur_id, bon_commande_id, date_livraison, statut, montant_ht, montant_tva, montant_ttc, stock_updated, notes, user_id) VALUES
('BL-2026-0001', (SELECT id FROM fournisseurs WHERE code='FRN-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM bons_commande WHERE numero='BC-2026-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), date('now','-85 days'), 'reçu', 3200.00, 640.00, 3840.00, 1, 'Réception conforme', '651a63e3-16ee-46bb-be68-b124c220e260');

INSERT INTO bon_livraison_lignes (bon_livraison_id, produit_id, reference, designation, quantite, prix_unitaire_ht, tva, montant_ht, montant_ttc, ordre) VALUES
((SELECT id FROM bons_livraison WHERE numero='BL-2026-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-001', 'Crème hydratante Hydrabio 40ml', 20, 95.00,  20, 1900.00, 2280.00, 0),
((SELECT id FROM bons_livraison WHERE numero='BL-2026-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-002', 'Sérum Vitamine C 30ml',          10, 130.00, 20, 1300.00, 1560.00, 1);

-- ============================================================================
--  DEPENSES — charges mensuelles sur ~6 mois (loyer, élec, salaires, etc.)
--  depenses.numero a une contrainte UNIQUE GLOBALE => on nettoie d'abord.
-- ============================================================================
DELETE FROM depenses WHERE numero IN (
  'DEP-2026-0001','DEP-2026-0002','DEP-2026-0003','DEP-2026-0004','DEP-2026-0005',
  'DEP-2026-0006','DEP-2026-0007','DEP-2026-0008','DEP-2026-0009','DEP-2026-0010',
  'DEP-2026-0011','DEP-2026-0012','DEP-2026-0013','DEP-2026-0014'
);
INSERT INTO depenses (numero, fournisseur_id, categorie, description, date_depense, montant_ht, tva, montant_tva, montant_ttc, mode_paiement, reference_paiement, notes, user_id) VALUES
('DEP-2026-0001', NULL, 'Loyer',       'Loyer local commercial', date('now','-160 days'), 6000.00, 20, 1200.00, 7200.00, 'Virement',     'VIR-3001', 'Mensuel', '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEP-2026-0002', NULL, 'Salaires',    'Salaires équipe',        date('now','-158 days'), 12000.00,0,  0.00,    12000.00,'Virement',     'VIR-3002', NULL,      '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEP-2026-0003', NULL, 'Loyer',       'Loyer local commercial', date('now','-130 days'), 6000.00, 20, 1200.00, 7200.00, 'Virement',     'VIR-3003', 'Mensuel', '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEP-2026-0004', NULL, 'Salaires',    'Salaires équipe',        date('now','-128 days'), 12000.00,0,  0.00,    12000.00,'Virement',     'VIR-3004', NULL,      '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEP-2026-0005', NULL, 'Électricité', 'Facture ONEE',           date('now','-120 days'), 850.00,  20, 170.00,  1020.00, 'Prélèvement',  'PREL-201', NULL,      '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEP-2026-0006', NULL, 'Loyer',       'Loyer local commercial', date('now','-100 days'), 6000.00, 20, 1200.00, 7200.00, 'Virement',     'VIR-3005', 'Mensuel', '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEP-2026-0007', NULL, 'Salaires',    'Salaires équipe',        date('now','-98 days'),  12000.00,0,  0.00,    12000.00,'Virement',     'VIR-3006', NULL,      '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEP-2026-0008', NULL, 'Internet',    'Abonnement fibre pro',   date('now','-90 days'),  400.00,  20, 80.00,   480.00,  'Prélèvement',  'PREL-202', NULL,      '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEP-2026-0009', NULL, 'Loyer',       'Loyer local commercial', date('now','-70 days'),  6000.00, 20, 1200.00, 7200.00, 'Virement',     'VIR-3007', 'Mensuel', '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEP-2026-0010', NULL, 'Salaires',    'Salaires équipe',        date('now','-68 days'),  12000.00,0,  0.00,    12000.00,'Virement',     'VIR-3008', NULL,      '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEP-2026-0011', (SELECT id FROM fournisseurs WHERE code='FRN-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'Transport', 'Frais de livraison', date('now','-45 days'), 500.00, 20, 100.00, 600.00, 'Espèces', NULL, NULL, '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEP-2026-0012', NULL, 'Loyer',       'Loyer local commercial', date('now','-40 days'),  6000.00, 20, 1200.00, 7200.00, 'Virement',     'VIR-3009', 'Mensuel', '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEP-2026-0013', NULL, 'Salaires',    'Salaires équipe',        date('now','-38 days'),  12000.00,0,  0.00,    12000.00,'Virement',     'VIR-3010', NULL,      '651a63e3-16ee-46bb-be68-b124c220e260'),
('DEP-2026-0014', NULL, 'Marketing',   'Publicité réseaux sociaux',date('now','-15 days'), 1500.00, 20, 300.00,  1800.00, 'Carte',        'CB-4501',  'Campagne', '651a63e3-16ee-46bb-be68-b124c220e260');

-- ============================================================================
--  VENTES PASSAGERS (10) — ventes comptoir sur les dernières semaines
-- ============================================================================
INSERT INTO ventes_passagers (numero, date, client_nom, montant_ht, montant_tva, montant_ttc, mode_paiement, cogs, notes, user_id) VALUES
('VP-2026-0001', date('now','-25 days'), 'Client comptoir', 145.00, 29.00, 174.00, 'Espèces', 78.00,  NULL, '651a63e3-16ee-46bb-be68-b124c220e260'),
('VP-2026-0002', date('now','-21 days'), 'Client comptoir', 210.00, 42.00, 252.00, 'Carte',   115.00, NULL, '651a63e3-16ee-46bb-be68-b124c220e260'),
('VP-2026-0003', date('now','-18 days'), 'Mme Karim',       99.00,  19.80, 118.80, 'Espèces', 54.00,  NULL, '651a63e3-16ee-46bb-be68-b124c220e260'),
('VP-2026-0004', date('now','-14 days'), 'Client comptoir', 175.00, 35.00, 210.00, 'Carte',   96.00,  NULL, '651a63e3-16ee-46bb-be68-b124c220e260'),
('VP-2026-0005', date('now','-10 days'), 'M. Alami',        320.00, 64.00, 384.00, 'Espèces', 172.00, NULL, '651a63e3-16ee-46bb-be68-b124c220e260'),
('VP-2026-0006', date('now','-7 days'),  'Client comptoir', 82.00,  16.40, 98.40,  'Espèces', 45.00,  NULL, '651a63e3-16ee-46bb-be68-b124c220e260'),
('VP-2026-0007', date('now','-5 days'),  'Client comptoir', 135.00, 27.00, 162.00, 'Carte',   72.00,  NULL, '651a63e3-16ee-46bb-be68-b124c220e260'),
('VP-2026-0008', date('now','-3 days'),  'Mme Bennani',     250.00, 50.00, 300.00, 'Espèces', 135.00, NULL, '651a63e3-16ee-46bb-be68-b124c220e260'),
('VP-2026-0009', date('now','-1 days'),  'Client comptoir', 68.00,  13.60, 81.60,  'Espèces', 36.00,  NULL, '651a63e3-16ee-46bb-be68-b124c220e260'),
('VP-2026-0010', date('now','0 days'),   'Client comptoir', 160.00, 32.00, 192.00, 'Carte',   88.00,  NULL, '651a63e3-16ee-46bb-be68-b124c220e260');

INSERT INTO ventes_passagers_lignes (vp_id, produit_id, reference, designation, quantite, prix_unitaire_ht, tva, montant_ht, montant_tva, montant_ttc, ordre) VALUES
((SELECT id FROM ventes_passagers WHERE numero='VP-2026-0001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-009' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-009', 'Shampoing anti-chute 200ml',   1, 135.00, 20, 135.00, 27.00, 162.00, 0),
((SELECT id FROM ventes_passagers WHERE numero='VP-2026-0002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-002' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-002', 'Sérum Vitamine C 30ml',        1, 210.00, 20, 210.00, 42.00, 252.00, 0),
((SELECT id FROM ventes_passagers WHERE numero='VP-2026-0003' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-005' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-005', 'Nettoyant moussant purifiant 150ml',1,110.00,20,110.00,22.00, 132.00, 0),
((SELECT id FROM ventes_passagers WHERE numero='VP-2026-0004' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-012' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-012', 'Huile réparatrice cheveux 100ml',1,195.00, 20, 195.00, 39.00, 234.00, 0),
((SELECT id FROM ventes_passagers WHERE numero='VP-2026-0005' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-004' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-004', 'Crème anti-âge Liftactiv 50ml',1, 320.00, 20, 320.00, 64.00, 384.00, 0),
((SELECT id FROM ventes_passagers WHERE numero='VP-2026-0006' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-021' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-021', 'Gel douche surgras 500ml',     1, 82.00,  20, 82.00,  16.40, 98.40,  0),
((SELECT id FROM ventes_passagers WHERE numero='VP-2026-0007' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-011' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-011', 'Shampoing antipelliculaire 200ml',1,120.00, 20, 120.00, 24.00, 144.00, 0),
((SELECT id FROM ventes_passagers WHERE numero='VP-2026-0008' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-028' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-028', 'Gel minceur cellulite 200ml',  1, 250.00, 20, 250.00, 50.00, 300.00, 0),
((SELECT id FROM ventes_passagers WHERE numero='VP-2026-0009' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-029' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-029', 'Thé minceur détox (x20 sachets)',1,68.00,  20, 68.00,  13.60, 81.60,  0),
((SELECT id FROM ventes_passagers WHERE numero='VP-2026-0010' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), (SELECT id FROM produits WHERE reference='PRD-001' AND user_id='651a63e3-16ee-46bb-be68-b124c220e260'), 'PRD-001', 'Crème hydratante Hydrabio 40ml',1, 160.00, 20, 160.00, 32.00, 192.00, 0);

-- ============================================================================
--  FIN. Rafraîchis l'application pour voir toutes les données.
--
--  Vérifications rapides (optionnel) :
--    SELECT statut, COUNT(*), SUM(montant_ttc) FROM factures
--      WHERE user_id='651a63e3-16ee-46bb-be68-b124c220e260' GROUP BY statut;
--    SELECT COUNT(*) FROM produits WHERE user_id='651a63e3-16ee-46bb-be68-b124c220e260';
--    SELECT designation, stock_actuel, stock_min FROM produits
--      WHERE user_id='651a63e3-16ee-46bb-be68-b124c220e260' AND stock_actuel < stock_min;
-- ============================================================================
