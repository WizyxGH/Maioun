-- ---------------------------------------------------------------------------
-- Entrer avec un compte Google (§26).
--
-- POURQUOI GOOGLE, ET POURQUOI MAINTENANT. Consulter est devenu libre : le
-- moment décisif n'est plus l'arrivée sur le site mais le premier geste — un
-- favori — et c'est là qu'on demande un compte. Une inscription qui réclame un
-- mot de passe puis une confirmation par e-mail perd la moitié des gens à cet
-- instant précis. Google rend une adresse DÉJÀ VÉRIFIÉE : rien à envoyer, rien
-- à confirmer, un seul geste.
--
-- ON S'ATTACHE AU `sub`, JAMAIS À L'ADRESSE. Le `sub` d'un jeton Google est
-- l'identifiant stable du compte ; l'adresse, elle, change — un compte
-- professionnel qui change de nom de domaine garde son `sub` et perd son
-- e-mail. Lier sur l'adresse aurait fabriqué un compte neuf ce jour-là, en
-- abandonnant favoris, dossier et historique.
--
-- ET C'EST AUSSI UNE QUESTION DE SÉCURITÉ : l'adresse d'un jeton n'est digne
-- de foi que si `email_verified` l'est. Le `sub` n'a pas ce défaut — il ne
-- dépend d'aucune déclaration.
--
-- NULLE POUR LES COMPTES À MOT DE PASSE, et c'est la cohabitation voulue.
-- SQLite tolère plusieurs NULL sous un index unique : les deux chemins vivent
-- côte à côte, et un même compte peut porter les deux — on rattache le `sub`
-- au compte existant quand l'adresse Google est vérifiée et déjà connue.
-- ---------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN google_sub TEXT;

-- UNIQUE : deux comptes Maïoun ne peuvent pas revendiquer le même compte
-- Google. Sans cet index, un rattachement raté en dupliquerait un, et la
-- connexion suivante tomberait sur l'un ou l'autre au hasard.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub)
WHERE google_sub IS NOT NULL;
