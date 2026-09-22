-- ---------------------------------------------------------------------------
-- QUAND LE CORPUS A ÉTÉ REGROUPÉ POUR LA DERNIÈRE FOIS.
--
-- Le regroupement relit TOUT le corpus vivant — 6 569 occurrences au
-- 2026-09-22 — puis TOUTES les fiches pour comparer leur empreinte. Il tournait
-- à chaque passage de collecte, soit 96 fois par jour, soit environ un million
-- de lignes lues quotidiennement chez Turso.
--
-- Or 276 des 338 fenêtres de quinze minutes des trois derniers jours n'ont vu
-- naître AUCUNE occurrence : quatre passages sur cinq regroupaient un corpus
-- rigoureusement identique pour en tirer le même résultat.
--
-- Le passage saute donc le regroupement quand rien n'a bougé — et cette table
-- dit depuis quand, pour qu'un corpus durablement calme finisse quand même par
-- être repassé : les scores vieillissent avec l'horloge, pas seulement avec les
-- annonces.
--
-- UNE SEULE LIGNE, et c'est voulu : `id = 1` avec une contrainte qui l'impose.
-- Un état global qui se met à avoir plusieurs lignes est un état global dont
-- personne ne sait plus laquelle fait foi.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS regroup_state (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  last_at      TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- LE CATALOGUE A PERDU SON INDEX.
--
-- La liste par défaut s'appuyait sur `matches_criteria`, servi par
-- `idx_listings_priority`. Depuis que les critères enregistrés s'appliquent en
-- direct — sans quoi élargir son budget de 700 à 750 € ne faisait entrer aucune
-- annonce —, la requête filtre sur le cycle de vie, le type de bien et la
-- commune, qu'aucun index ne couvrait : chaque chargement de la liste
-- parcourait les 5 157 fiches.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_listings_catalogue
  ON listings (lifecycle, property_type, city);
