-- ---------------------------------------------------------------------------
-- Remplir `listings.available_at` à partir de ce que les fiches portent déjà.
--
-- LA COLONNE EST NÉE VIDE, ET SERAIT RESTÉE VIDE. `saveListings` compare une
-- empreinte du contenu et n'écrit RIEN quand elle n'a pas bougé — c'est ce qui
-- rend la collecte économe (§30). Or ajouter une colonne ne change pas le
-- contenu : les mille fiches déjà en base auraient donc gardé `NULL` jusqu'à ce
-- qu'un prix bouge, c'est-à-dire pendant des semaines pour la plupart, et
-- jamais pour celles qui ne changent plus.
--
-- Le filtre « disponible au plus tard le… » n'aurait rien eu à filtrer, sans
-- que rien ne le dise — le pire des cas, puisqu'il aurait paru fonctionner :
-- les dates inconnues ne sont jamais écartées (§17), la liste serait donc
-- restée complète, et l'on aurait cru qu'aucune annonce n'était concernée.
--
-- LA VALEUR N'EST PAS RECALCULÉE, elle est RECOPIÉE : la charge utile de
-- chaque fiche porte déjà la date, sous `availableAt.value`. On la sort du JSON
-- pour la ranger là où une requête peut la lire.
-- ---------------------------------------------------------------------------

UPDATE listings
SET available_at = json_extract(payload, '$.availableAt.value')
WHERE available_at IS NULL
  AND json_extract(payload, '$.availableAt.value') IS NOT NULL;
