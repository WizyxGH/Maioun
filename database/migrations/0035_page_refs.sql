-- ---------------------------------------------------------------------------
-- Ce que portait une page de liste la dernière fois qu'on l'a téléchargée.
--
-- UNE PAGE INCHANGÉE N'EST PAS UNE PAGE VIDE. Le collecteur envoie des requêtes
-- conditionnelles : quand une page n'a pas bougé, le site répond 304, sans
-- contenu — c'est tout l'intérêt, on ne retélécharge pas ce qu'on a déjà. Mais
-- les annonces de cette page n'étaient alors comptées nulle part.
--
-- Mesuré le 2026-09-10 sur Bien'ici : 191 de ses 340 requêtes en deux jours
-- sont revenues en 304. Un passage entièrement inchangé rendait « 0 annonce »
-- pour 510 en ligne ; un passage à moitié inchangé comptait l'autre moitié
-- comme ABSENTE, et la rapprochait d'un retrait qu'elle ne méritait pas.
--
-- On garde donc, par adresse, les références que la page portait. Sur un 304,
-- elles valent confirmation : la page n'a pas changé, les annonces non plus.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS page_refs (
  -- L'adresse EXACTE de la page, requête comprise : c'est elle que le 304
  -- concerne, et deux pages d'une même recherche n'ont pas le même contenu.
  url         TEXT PRIMARY KEY,
  -- Les références de la page, en tableau JSON.
  refs        TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
