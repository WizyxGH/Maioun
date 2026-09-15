-- ---------------------------------------------------------------------------
-- La fiche telle que la LISTE la transporte, préparée à l'écriture.
--
-- Chaque chargement de la liste retirait en SQL ce que la carte n'affiche pas,
-- puis le Worker analysait et réémettait chaque fiche en JSON : 2,5 Mo, et
-- jusqu'à 94 ms de processeur pour un palier gratuit de dix. La collecte range
-- désormais la version allégée à côté de la fiche ; le Worker la recopie.
--
-- `list_payload` : la fiche sans description, sans scores ni trajets — ces
-- deux-là sont personnels et se joignent depuis `listing_user_score`.
-- `list_scores` : les scores, raisons vidées. Sur la fiche, ceux d'un lecteur
-- qui n'a pas de score propre ; sur le score du compte, les siens.
-- `list_hash` : l'empreinte du contenu au moment où ces colonnes ont été
-- écrites. Une ligne réécrite par un code qui les ignore n'a plus la même
-- empreinte, et la lecture retombe alors sur le calcul d'avant plutôt que de
-- servir une version périmée.
-- ---------------------------------------------------------------------------

ALTER TABLE listings ADD COLUMN list_payload TEXT;
ALTER TABLE listings ADD COLUMN list_scores TEXT;
ALTER TABLE listings ADD COLUMN list_hash TEXT;
ALTER TABLE listing_user_score ADD COLUMN list_scores TEXT;
ALTER TABLE listing_user_score ADD COLUMN list_hash TEXT;

-- Reprise de l'existant, pour ne pas attendre que la collecte réécrive tout.
-- Une ligne de forme inattendue n'est pas reprise : sans `list_hash`, la
-- lecture la traite comme avant. Les CASE imbriqués garantissent l'ordre
-- d'évaluation — `json_type` lève sur un JSON invalide.
UPDATE listings
   SET list_payload = json_remove(payload, '$.description', '$.scores', '$.distances'),
       list_scores = CASE WHEN json_type(payload, '$.scores') = 'object' THEN (
         SELECT json_group_object(key, json_set(value, '$.reasons', json('[]')))
           FROM json_each(payload, '$.scores')
       ) END,
       list_hash = content_hash
 WHERE CASE
   WHEN NOT json_valid(payload) THEN 0
   WHEN json_type(payload) != 'object' THEN 0
   WHEN json_type(payload, '$.scores') IS NULL THEN 1
   WHEN json_type(payload, '$.scores') != 'object' THEN 0
   ELSE NOT EXISTS (SELECT 1 FROM json_each(payload, '$.scores') WHERE type != 'object')
 END;

UPDATE listing_user_score
   SET list_scores = CASE WHEN scores IS NULL THEN NULL ELSE (
         SELECT json_group_object(key, json_set(value, '$.reasons', json('[]')))
           FROM json_each(scores)
       ) END,
       list_hash = content_hash
 WHERE CASE
   WHEN distances IS NOT NULL AND (typeof(distances) != 'text' OR NOT json_valid(distances)) THEN 0
   WHEN scores IS NULL THEN 1
   WHEN typeof(scores) != 'text' OR NOT json_valid(scores) THEN 0
   WHEN json_type(scores) != 'object' THEN 0
   ELSE NOT EXISTS (SELECT 1 FROM json_each(scores) WHERE type != 'object')
 END;
