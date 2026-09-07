-- ---------------------------------------------------------------------------
-- Ouvrir la création de comptes, sans ouvrir la porte à n'importe qui.
--
-- LES COMPTES SE CRÉAIENT EN LIGNE DE COMMANDE, depuis la machine qui a le
-- jeton de la base. C'était tenable tant qu'il n'y avait qu'un utilisateur ;
-- ça ne l'est plus dès qu'on vend le service. Mais un formulaire d'inscription
-- posé tel quel sur Internet se remplit tout seul : adresses jetables,
-- inscriptions en boucle, comptes créés pour épuiser le quota gratuit.
--
-- TROIS CHOSES MANQUAIENT, et cette migration les apporte.
--
--   1. SAVOIR SI UNE ADRESSE A ÉTÉ PROUVÉE. Une adresse saisie n'est qu'une
--      chaîne de caractères : rien ne dit qu'elle existe, ni qu'elle appartient
--      à celui qui la saisit. `email_verified` distingue une adresse SAISIE
--      d'une adresse CONFIRMÉE — et la réinitialisation de mot de passe, qui
--      écrit à cette adresse, a besoin de cette différence.
--
--   2. DE QUOI CONFIRMER. Le même mécanisme que la réinitialisation : un jeton
--      dont seule l'empreinte est conservée, qui expire et ne sert qu'une fois.
--      Une base qui fuite ne doit livrer aucun laissez-passer utilisable.
--
--   3. UN COMPTEUR DE TENTATIVES. Sans lui, rien n'empêche de créer mille
--      comptes en une minute, ni de demander mille liens de réinitialisation
--      pour faire pleuvoir des messages sur la boîte de quelqu'un d'autre.
--
-- L'UNICITÉ DE L'ADRESSE EST INSENSIBLE À LA CASSE, parce que les gens le
-- sont : `Jean@example.com` et `jean@example.com` sont la même boîte partout, et
-- deux comptes sur la même adresse rendraient « mot de passe oublié »
-- ambigu — on écrirait à une boîte pour un compte que son propriétaire ne
-- reconnaîtrait pas. Les adresses NULLES échappent à l'index, comme le veut
-- SQLite : un compte sans adresse reste possible, et il y en a déjà.
-- ---------------------------------------------------------------------------

-- Les comptes existants ont été créés à la main, depuis la machine qui a la
-- base : leur adresse, quand elle est là, a été saisie par leur propriétaire.
-- Les marquer non vérifiés les priverait de la réinitialisation sans rien
-- prouver de plus.
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1;

-- Les comptes à VENIR, eux, naissent non vérifiés : c'est la valeur que le code
-- écrit explicitement à l'inscription. La valeur par défaut ne vaut que pour
-- les lignes déjà là.

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (lower(email));

-- ---------------------------------------------------------------------------
-- La confirmation d'adresse. Jumelle de `password_resets`, et délibérément :
-- deux tables plutôt qu'une, parce qu'un jeton de confirmation et un jeton de
-- réinitialisation n'ouvrent pas la même porte. Les confondre, c'est risquer
-- qu'un lien de confirmation — envoyé plus largement, conservé plus longtemps —
-- serve un jour à changer un mot de passe.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verifications (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications (user_id);

-- ---------------------------------------------------------------------------
-- Le compteur de tentatives.
--
-- UNE LIGNE PAR SEAU, un seau étant « ce qu'on limite » — par exemple
-- `signup:<empreinte de l'IP>` ou `forgot:<identifiant>`. La fenêtre glisse par
-- remise à zéro : quand la précédente est révolue, la ligne repart à un plutôt
-- que de s'accumuler. C'est moins fin qu'une vraie fenêtre glissante, et
-- largement suffisant pour ce qu'on protège.
--
-- L'IP N'EST PAS CONSERVÉE EN CLAIR. Une adresse IP est une donnée
-- personnelle : on n'en garde qu'une empreinte, inutilisable pour retrouver
-- quiconque, et seulement le temps de la fenêtre.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start TEXT NOT NULL
);
