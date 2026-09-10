-- ---------------------------------------------------------------------------
-- Le cache des diagnostics de performance énergétique cherchés chez l'ADEME.
--
-- POURQUOI UN CACHE. Une adresse ne déménage pas et un diagnostic vaut dix
-- ans : la même recherche donnerait le même résultat à chaque collecte. Sans
-- cette table, les six cents annonces qui ont une adresse et pas d'étiquette
-- rappelleraient l'API d'État toutes les demi-heures, pour rien.
--
-- LES ÉCHECS SONT MÉMORISÉS AUSSI, et c'est le principal. Une adresse
-- introuvable le restera : ne garder que les succès reviendrait à ne rien
-- cacher du tout, puisque ce sont justement les échecs qui se répètent.
--
-- UNE PANNE RÉSEAU, ELLE, N'EST PAS ÉCRITE ICI — le code s'en charge. Ce n'est
-- pas une absence de diagnostic, et la mémoriser condamnerait l'annonce à ne
-- jamais être retrouvée.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dpe_cache (
  -- « adresse comparable | code postal | surface arrondie ». La SURFACE en fait
  -- partie : un immeuble porte des dizaines de logements et donc des dizaines
  -- de diagnostics, et c'est elle qui les distingue.
  key           TEXT PRIMARY KEY,

  -- Étiquette énergie « A »–« G ». NULL = recherche infructueuse, ce qui est
  -- une information à part entière et non un trou.
  label         TEXT,
  -- Étiquette climat, quand le diagnostic la porte.
  ges_label     TEXT,
  -- Année de construction : aucune source d'annonces ne la publie.
  built_year    INTEGER,
  -- Surface habitable mesurée par le diagnostic, pour pouvoir la comparer plus
  -- tard à celle que l'annonce déclare.
  area          REAL,

  searched_at   TEXT NOT NULL
);
