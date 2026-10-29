-- ---------------------------------------------------------------------------
-- CE QU'UN PASSAGE ET UN SONDAGE DU SITE RELISAIENT POUR RIEN.
--
-- Octobre 2026 : 503 millions de lignes lues en une semaine, quota mensuel de
-- Turso épuisé le 8. Mesuré en rejouant un passage et les requêtes du site sur
-- la base locale (`.scanstats` de sqlite3), quatre familles de balayages :
--
--   - les requêtes PAR SOURCE (références connues, compte, péremption, absents)
--     parcouraient toutes les occurrences de la source, ÉTEINTES comprises —
--     et les éteintes ne font que s'accumuler ;
--   - l'élagage de l'historique balayait `listing_history` entière à chaque
--     passage, faute d'index sur la seule date ;
--   - l'empreinte de la liste, demandée par le site TOUTES LES MINUTES par
--     onglet ouvert, comptait toutes les fiches pour répondre « rien n'a
--     changé » : trois maxima indexés suffisent ;
--   - la purge des fiches orphelines matérialisait toutes les occurrences, une
--     fois par fusion (voir `ORPHAN_PREDICATE`, qui n'a pas besoin d'index neuf).
-- ---------------------------------------------------------------------------

-- Les occurrences VIVANTES d'une source, seules : l'index partiel ne grossit
-- pas avec le stock éteint. Les requêtes doivent porter le terme exact
-- `lifecycle != 'inactive'` pour que SQLite le choisisse.
CREATE INDEX IF NOT EXISTS idx_occurrences_vivantes
  ON occurrences (source_id, last_seen_at) WHERE lifecycle != 'inactive';
-- La relecture des plus anciennes fiches (`knownRefs`) les prend dans l'ordre
-- de `scraped_at` : servie dans cet ordre, elle s'arrête aux deux premières.
CREATE INDEX IF NOT EXISTS idx_occurrences_vivantes_relues
  ON occurrences (source_id, scraped_at) WHERE lifecycle != 'inactive';
-- Les bascules d'un absent (`markMissing`) ne visitent que les absents.
CREATE INDEX IF NOT EXISTS idx_occurrences_vivantes_absentes
  ON occurrences (source_id, missing_runs) WHERE lifecycle != 'inactive';

-- L'élagage des journaux, par date seule.
CREATE INDEX IF NOT EXISTS idx_history_recorded ON listing_history (recorded_at);
CREATE INDEX IF NOT EXISTS idx_events_occurred ON events (occurred_at);

-- L'empreinte de la liste : la dernière modification d'une fiche, et celles de
-- l'état et du score d'UN compte — chacune une seule entrée d'index.
CREATE INDEX IF NOT EXISTS idx_listings_updated ON listings (updated_at);
CREATE INDEX IF NOT EXISTS idx_listing_user_state_updated
  ON listing_user_state (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_listing_user_score_updated
  ON listing_user_score (user_id, updated_at);

-- Les candidatures fermées (`noteClosedApplications`, à chaque passage) : le
-- statut vit dans le JSON de la fiche, et le chercher relisait toutes les
-- fiches (4 654 sur la base locale) pour en trouver trois. L'index partiel ne
-- contient que celles-là ; la requête doit porter ce terme EXACT.
CREATE INDEX IF NOT EXISTS idx_listings_candidatures_closes
  ON listings (id) WHERE json_extract(payload, '$.applicationStatus') = 'full';
