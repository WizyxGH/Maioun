-- ---------------------------------------------------------------------------
-- L'état personnel encore porté par `listings`, rendu au compte principal.
--
-- Les requêtes de l'API plaçaient `listings.*` avant les colonnes du lecteur :
-- à nom égal, libsql rend la première. Vu, favori, archivage, suivi et date
-- d'alerte se lisaient donc sur la fiche commune — celle que chaque compte
-- écrivait —, et tout le monde voyait ceux du compte principal. La lecture ne
-- regarde plus que `listing_user_state`.
--
-- Relevé le 2026-09-15 : six fiches n'avaient d'état que sur `listings`, sept
-- « vue » et un favori manquaient à des lignes d'état existantes, vingt-sept
-- dates d'alerte n'étaient que sur la fiche. Un seul compte existe ; tout cela
-- est à lui.
--
-- Fusion sans recul : un drapeau levé le reste, un suivi avancé n'est pas
-- remplacé, une date d'alerte déjà connue est gardée. `favorited_at` reste
-- vide, comme pour les favoris d'avant sa création : inventer une date
-- déclencherait un rappel. Les colonnes de `listings` restent en place.
-- ---------------------------------------------------------------------------

INSERT INTO listing_user_state
  (user_id, listing_id, viewed, archived, favorite, tracking, notified, notified_at, drafted, updated_at)
SELECT 'moi',
       id,
       COALESCE(viewed, 0),
       COALESCE(archived, 0),
       COALESCE(favorite, 0),
       CASE WHEN tracking IS NULL OR tracking IN ('new', 'none') THEN 'new' ELSE tracking END,
       CASE WHEN notified_at IS NOT NULL THEN 1 ELSE 0 END,
       notified_at,
       COALESCE(drafted, 0),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM listings
 WHERE EXISTS (SELECT 1 FROM users WHERE users.id = 'moi')
   AND (COALESCE(viewed, 0) = 1
     OR COALESCE(archived, 0) = 1
     OR COALESCE(favorite, 0) = 1
     OR COALESCE(drafted, 0) = 1
     OR notified_at IS NOT NULL
     OR COALESCE(tracking, 'new') NOT IN ('new', 'none'))
ON CONFLICT(user_id, listing_id) DO UPDATE SET
  viewed = MAX(listing_user_state.viewed, excluded.viewed),
  archived = MAX(listing_user_state.archived, excluded.archived),
  favorite = MAX(listing_user_state.favorite, excluded.favorite),
  tracking = CASE WHEN listing_user_state.tracking IN ('new', 'none')
                  THEN excluded.tracking ELSE listing_user_state.tracking END,
  notified = MAX(listing_user_state.notified, excluded.notified),
  notified_at = COALESCE(listing_user_state.notified_at, excluded.notified_at),
  drafted = MAX(listing_user_state.drafted, excluded.drafted),
  updated_at = excluded.updated_at;
