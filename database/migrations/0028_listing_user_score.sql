-- ---------------------------------------------------------------------------
-- La PERTINENCE d'une annonce dépend de qui regarde.
--
-- `listings.matches_criteria` et `listings.action_priority` étaient des
-- colonnes de la FICHE : calculées une fois par la collecte, pour les critères
-- d'un seul utilisateur, et lues par tout le monde. Tant qu'il n'y avait qu'un
-- compte, c'était juste. Dès qu'il y en a deux, c'est faux pour le second :
-- sa liste est filtrée sur le budget du premier, et ses notifications aussi.
--
-- POURQUOI UNE TABLE ET NON UN CALCUL EN SQL. On aurait pu traduire les
-- critères en conditions SQL et se passer de colonnes — c'est ce que font déjà
-- les quatre préférences de lecture. Mais « correspond aux critères » n'est pas
-- une comparaison : c'est la ville avec ses variantes, le loyer avec son
-- plancher anti-parking, la surface, le trajet, le type de bien, et surtout la
-- règle qui veut qu'une donnée ABSENTE n'élimine jamais (§17). Réécrire tout
-- cela en SQL, c'est en avoir deux définitions — et la seconde diverge
-- toujours. On garde donc UNE définition, en TypeScript, déjà éprouvée, et on
-- range son résultat par compte.
--
-- CE QUI RESTE COMMUN. L'annonce elle-même, ses photos, son dédoublonnage, son
-- cycle de vie : ce sont des faits sur le marché, pas sur une personne. Seule
-- la lecture qu'on en fait est personnelle.
--
-- LE TEMPS DE TRAJET RESTE APPROCHÉ POUR LES AUTRES COMPTES. Le routage en
-- transports (Navitia) coûte un appel par annonce et par destination : le
-- refaire pour chaque compte épuiserait le quota gratuit (§30). Chaque compte
-- est donc scoré avec SES points de référence — la distance à vol d'oiseau,
-- gratuite, est juste pour lui — et seul le compte servi par la collecte
-- bénéficie du temps de trajet réel. C'est exactement le comportement du
-- système quand Navitia n'est pas configuré, et le score le dit.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS listing_user_score (
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id       TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  matches_criteria INTEGER NOT NULL DEFAULT 0,
  action_priority  INTEGER NOT NULL DEFAULT 0,
  match_score      INTEGER,
  opportunity_score INTEGER,
  visit_score      INTEGER,
  risk_score       INTEGER,
  -- Le trajet retenu pour CE compte, avec SES points de référence.
  commute_minutes  INTEGER,
  -- Empreinte de ce qui a été scoré : sans elle, chaque collecte réécrirait
  -- toutes les lignes de tous les comptes (§30).
  content_hash     TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (user_id, listing_id)
);

-- L'index sert la requête de liste : « ce qui correspond à ce compte, par
-- priorité décroissante ».
CREATE INDEX IF NOT EXISTS idx_listing_user_score_lookup
  ON listing_user_score (user_id, matches_criteria, action_priority DESC);

-- ---------------------------------------------------------------------------
-- Reprise de l'existant pour le compte déjà servi.
--
-- Sans elle, sa liste serait VIDE jusqu'à la prochaine collecte : la requête
-- lira désormais cette table, et rien n'y serait. On recopie donc ce que les
-- colonnes de `listings` portent aujourd'hui — c'est exactement son score.
--
-- `'moi'` EN DUR, ET NON `CURRENT_USER` : une migration est un instantané, pas
-- du code. Elle doit produire le même résultat dans dix ans, même si la
-- constante change de valeur — auquel cas c'est une migration suivante qui
-- renommera les lignes, pas celle-ci qui se mettra à écrire ailleurs. La
-- valeur d'aujourd'hui est dans `packages/shared/src/user.ts`.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO listing_user_score (
  user_id, listing_id, matches_criteria, action_priority,
  match_score, opportunity_score, visit_score, risk_score,
  commute_minutes, content_hash, updated_at
)
SELECT 'moi', id, COALESCE(matches_criteria, 0), COALESCE(action_priority, 0),
       match_score, opportunity_score, visit_score, risk_score,
       commute_minutes, COALESCE(content_hash, ''), datetime('now')
FROM listings;
