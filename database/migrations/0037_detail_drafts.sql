-- ---------------------------------------------------------------------------
-- Ce qu'une FICHE d'annonce a appris, gardé jusqu'à sa prochaine relecture.
--
-- L'ENRICHISSEMENT NE DURAIT QU'UN PASSAGE. Une annonce était complétée par sa
-- fiche le jour de sa découverte ; au passage suivant, déjà connue, elle
-- n'était plus visitée — et la version TRONQUÉE de la liste écrasait tout ce
-- que la fiche avait appris. Relevé le 2026-09-10 : l'annonce Orpi corrigée le
-- matin même (869 caractères) était retombée à 148 ; aucune description FNAIM
-- ne dépassait 263 caractères quand la fiche en porte 1 289 ; les conditions du
-- bailleur, lues dans ces textes complets, s'effaçaient avec eux. Depuis sa
-- création, le mécanisme n'avait servi, pour chaque annonce, que le temps
-- d'une demi-heure.
--
-- On garde donc ce que la fiche a donné, et on le réapplique à chaque passage.
-- Il ne coûte aucune requête : c'est une lecture en base, faite une fois par
-- source.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS detail_drafts (
  source_id   TEXT NOT NULL,
  source_ref  TEXT NOT NULL,
  -- Les champs appris sur la fiche, en objet JSON — seulement ceux-là.
  draft       TEXT NOT NULL,
  -- Quand la fiche a été lue : au-delà d'une semaine, on la relit si le budget
  -- le permet, pour ne pas figer un texte que l'annonceur aurait changé.
  fetched_at  TEXT NOT NULL,
  PRIMARY KEY (source_id, source_ref)
);
