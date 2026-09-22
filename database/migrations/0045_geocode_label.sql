-- L'ADRESSE TELLE QUE LA BAN L'ÉCRIT, à côté du point qu'elle a placé.
--
-- Le cache ne gardait que les coordonnées : l'adresse normalisée revenait dans
-- la même réponse et était jetée. La garder ici épargne un appel par adresse —
-- et, surtout, permet de corriger ce que les sources écrivent de travers sans
-- rien interroger de plus. « 52 SMOLETT, 06000 Nice » est en réalité
-- « 52 Rue Smollett 06300 Nice » : la voie manquait, le nom perdait un L, et
-- le code postal était celui que l'agence met partout.
--
-- NULL pour les entrées déjà mémorisées : on ne devine pas, elles se
-- compléteront à leur prochaine résolution.
ALTER TABLE geocode_cache ADD COLUMN label TEXT;
ALTER TABLE geocode_cache ADD COLUMN postcode TEXT;
