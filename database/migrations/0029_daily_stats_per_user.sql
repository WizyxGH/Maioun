-- ---------------------------------------------------------------------------
-- L'HISTORIQUE DE L'INVENTAIRE APPARTIENT À CELUI QUI LE REGARDE.
--
-- `daily_stats` avait le jour pour clé primaire, et une seule ligne par jour :
-- « 42 annonces pertinentes le 3 septembre ». Pertinentes pour QUI ? Pour le
-- compte que sert la collecte, puisque le décompte se lisait sur
-- `listings.matches_criteria`. Un second compte ouvrait la page Statistiques
-- et y voyait la courbe de quelqu'un d'autre — sans que rien ne le dise, car
-- une courbe est toujours vraisemblable.
--
-- CE QUI RESTE COMMUN dans la ligne : `total` et `active_sources` décrivent le
-- marché et la collecte, pas une personne. Ils sont donc recopiés à l'identique
-- pour chaque compte. Les dupliquer coûte quelques octets par jour et évite une
-- seconde table dont la jointure n'apprendrait rien.
--
-- SQLite NE SAIT PAS CHANGER UNE CLÉ PRIMAIRE : on reconstruit la table, on
-- recopie, on renomme. L'historique déjà enregistré est attribué à `moi`
-- (`CURRENT_USER`), le compte pour lequel il a effectivement été calculé —
-- l'attribuer à tous serait inventer un passé aux comptes qui n'existaient pas.
--
-- L'ANCIENNE TABLE N'EST PAS SUPPRIMÉE, elle est mise de côté sous
-- `daily_stats_avant_0029`. Une migration qui recopie puis détruit se vérifie
-- très bien sur une base de test vide et n'y prouve rien : ce qui est en jeu,
-- c'est un historique quotidien que RIEN ne reconstitue — il se réaccumulerait
-- un jour par jour. Le coût de la garder est quelques kilo-octets ; celui de
-- s'être trompé est définitif. Une migration ultérieure la supprimera, une fois
-- la nouvelle vérifiée en ligne.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS daily_stats_per_user (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day            TEXT NOT NULL,
  matching       INTEGER NOT NULL,
  uncertain      INTEGER NOT NULL,
  rented         INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  active_sources INTEGER NOT NULL,
  recorded_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);

INSERT OR IGNORE INTO daily_stats_per_user (
  user_id, day, matching, uncertain, rented, total, active_sources, recorded_at
)
SELECT 'moi', day, matching, uncertain, rented, total, active_sources, recorded_at
FROM daily_stats;

ALTER TABLE daily_stats RENAME TO daily_stats_avant_0029;

ALTER TABLE daily_stats_per_user RENAME TO daily_stats;
