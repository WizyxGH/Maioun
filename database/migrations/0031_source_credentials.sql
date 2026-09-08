-- ---------------------------------------------------------------------------
-- Les identifiants d'une source PAYÉE, compte par compte (§6, §26).
--
-- L'ABONNEMENT EST PERSONNEL, LA CONFIGURATION ÉTAIT GLOBALE. L'accès abonné
-- BEP est payé par une personne, et vivait pourtant dans `BEP_SUBSCRIBER_*` :
-- une variable d'environnement, donc réservée à qui tient le `.env`. Un second
-- compte ne pouvait pas se servir de l'abonnement qu'il paie lui-même, ni même
-- déclarer qu'il en a un.
--
-- POURQUOI ON ACCEPTE DE STOCKER CE SECRET-LÀ, alors que le §26 refuse le mot
-- de passe d'une boîte mail. Une boîte contient toute la correspondance de
-- quelqu'un ; un bulletin d'annonces contient des biens à louer. Et il n'existe
-- pour lui ni OAuth ni transfert : le choix se résume à stocker cet
-- identifiant, ou renoncer à ce que chacun exploite son propre abonnement.
--
-- CE QUE CELA IMPOSE, et qui tient dans la forme de la table :
--
--   * `secret_encrypted` porte un chiffré AES-GCM, jamais une valeur en clair.
--     La clé est un secret de plateforme, ni dans le dépôt ni dans cette base ;
--   * `login` reste en clair, à dessein : l'écran doit pouvoir afficher SOUS
--     QUEL identifiant l'abonnement est déclaré, sinon on ne sait plus lequel
--     on a saisi. Un identifiant n'ouvre rien sans son secret ;
--   * rien ne ressort jamais vers le navigateur — l'écran dit « configuré » et
--     propose de remplacer, jamais de relire.
--
-- LA TABLE EST GÉNÉRIQUE. BEP est la première source payante, elle ne sera pas
-- la dernière ; une colonne `bep_password` sur `users` aurait demandé une
-- migration à chaque nouvelle.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS source_credentials (
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id        TEXT NOT NULL,
  login            TEXT NOT NULL,
  secret_encrypted TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (user_id, source_id)
);

-- La collecte cherche « qui a un abonnement à cette source », jamais l'inverse.
CREATE INDEX IF NOT EXISTS idx_source_credentials_source
  ON source_credentials (source_id);
