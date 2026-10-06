-- ---------------------------------------------------------------------------
-- LE JOURNAL DES PASSAGES SE LIT PAR DATE.
--
-- La surveillance des sources et l'écran Sources lisaient `collection_runs`
-- EN ENTIER à chaque appel — une ligne par source et par passage, des dizaines
-- de milliers, et deux parcours par collecte. C'était le premier poste de
-- lignes lues chez Turso (quota à 75 % le 7 du mois, 2026-10-07). Les
-- requêtes se bornent désormais à une fenêtre de dates, que cet index sert.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_runs_started ON collection_runs (started_at);
