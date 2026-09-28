-- ---------------------------------------------------------------------------
-- QUAND ON A PRÉVENU D'UNE BAISSE DE LOYER OU D'UNE MODIFICATION D'ANNONCE (§29).
--
-- Une annonce déjà connue dont le loyer baisse ou dont les informations changent
-- mérite une alerte dédiée si l'utilisateur l'a demandée.
--
-- Colonnes à part dans listing_user_state pour ne pas confondre avec la notification
-- initiale d'arrivée ou de retour en ligne.
-- ---------------------------------------------------------------------------

ALTER TABLE listing_user_state ADD COLUMN price_drop_notified_at TEXT;
ALTER TABLE listing_user_state ADD COLUMN update_notified_at TEXT;
