-- ---------------------------------------------------------------------------
-- La date de disponibilité, sur la FICHE.
--
-- ELLE N'EXISTAIT QUE SUR L'OCCURRENCE. La colonne `available_at` est en base
-- depuis l'origine, mais du côté d'`occurrences` : la fiche fusionnée la porte
-- dans sa charge utile JSON, et nulle part sous une forme interrogeable. Un
-- filtre « disponible avant le… » aurait donc dû ouvrir et parcourir le JSON de
-- chaque ligne à chaque requête — ce que SQLite sait faire, et qu'on paie à
-- chaque affichage de la liste (§30).
--
-- C'EST LE MÊME CHOIX QUE POUR LES QUATRE PRÉFÉRENCES de lecture — colocation,
-- bail étudiant, bailleur, ameublement — sorties du JSON pour la même raison
-- (migration 0022). Une donnée sur laquelle on filtre est une colonne.
--
-- L'INDEX EST PARTIEL : deux tiers des annonces ne publient aucune date, et les
-- indexer reviendrait à ranger soigneusement du vide. Le filtre, lui, ne
-- s'intéresse qu'aux lignes qui en portent une.
-- ---------------------------------------------------------------------------

ALTER TABLE listings ADD COLUMN available_at TEXT;

CREATE INDEX IF NOT EXISTS idx_listings_available_at
  ON listings (available_at) WHERE available_at IS NOT NULL;
