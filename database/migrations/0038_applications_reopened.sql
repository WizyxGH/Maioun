-- ---------------------------------------------------------------------------
-- Les candidatures qui rouvrent.
--
-- Une annonce « Dépôt de candidature : complet » sort de la liste d'office et
-- y revient quand un dossier refusé libère une place — le moment où il faut
-- candidater vite, et qui passait sans un mot. On note quand une annonce déjà
-- signalée à ce compte a fermé ses candidatures ; sa réouverture déclenche une
-- alerte, puis la trace s'efface pour la fermeture suivante.
-- ---------------------------------------------------------------------------

ALTER TABLE listing_user_state ADD COLUMN applications_closed_at TEXT;
