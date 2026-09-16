-- L'état personnel rendu au compte par 0041 : plus rien ne l'écrit ni ne le lit
-- dans `listings`, toutes les lectures passent par `listing_user_state`. Ces
-- colonnes ne pouvaient de toute façon décrire qu'un seul compte.
--
-- Les index d'abord : SQLite refuse de retirer une colonne indexée.
DROP INDEX IF EXISTS idx_listings_favorite;
DROP INDEX IF EXISTS idx_listings_notified;
DROP INDEX IF EXISTS idx_listings_drafted;
DROP INDEX IF EXISTS idx_listings_notified_at;

ALTER TABLE listings DROP COLUMN viewed;
ALTER TABLE listings DROP COLUMN favorite;
ALTER TABLE listings DROP COLUMN notified;
ALTER TABLE listings DROP COLUMN notified_at;
ALTER TABLE listings DROP COLUMN drafted;
