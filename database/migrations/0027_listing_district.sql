-- ---------------------------------------------------------------------------
-- Le quartier, sous une forme sur laquelle on puisse filtrer.
--
-- IL N'EXISTAIT QUE DANS LE JSON, et sous cent une graphies pour une
-- quarantaine de lieux réels : « Vieux Nice » et « Vieux-Nice », « Liberation »
-- et « Libération », « PORT » et « Le Port », « Mont Boron », « Mont-Boron » et
-- « - MONT BORON ». On ne peut ni proposer cela dans un menu, ni filtrer
-- dessus : cocher « Le Port » aurait raté trente et une annonces rangées sous
-- « PORT ».
--
-- LA COLONNE PORTE LE SLUG CANONIQUE, pas le texte de la source. La table de
-- correspondance vit dans `packages/shared/src/districts.ts`, partagée par la
-- normalisation qui range, l'API qui filtre et l'écran qui affiche — trois
-- copies auraient divergé (§75). Le texte d'origine reste dans la charge utile,
-- intact : on n'écrase pas ce que la source a dit (§15).
--
-- L'INDEX EST PARTIEL : la moitié des annonces ne nomment aucun quartier, et
-- les indexer reviendrait à ranger du vide.
-- ---------------------------------------------------------------------------

ALTER TABLE listings ADD COLUMN district TEXT;

CREATE INDEX IF NOT EXISTS idx_listings_district
  ON listings (district) WHERE district IS NOT NULL;
