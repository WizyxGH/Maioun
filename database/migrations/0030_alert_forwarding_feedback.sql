-- ---------------------------------------------------------------------------
-- Ce que chaque compte doit savoir de SON transfert (§6).
--
-- L'ADRESSE ÉTAIT DÉJÀ PROPRE À CHAQUE COMPTE (0021), mais rien ne revenait
-- vers lui. Il posait une règle dans sa boîte, puis attendait sans jamais
-- savoir si elle marchait : une règle mal filtrée, un portail qui change
-- d'expéditeur, une adresse recopiée de travers ne produisent aucune erreur —
-- seulement du silence, exactement ce que produit une installation qui va
-- bien un jour sans nouvelle annonce. On ne peut pas corriger ce qu'on ne
-- voit pas.
--
-- Le collecteur SAIT pourtant : il extrait le jeton de chaque message reçu.
-- Cette information s'arrêtait là. On la range ici, par compte, pour que
-- l'écran de réglages puisse dire « dernière alerte reçue hier, 12 annonces »
-- ou « aucune à ce jour » (§17).
-- ---------------------------------------------------------------------------

-- Horodatage du dernier message accepté pour ce jeton. NULL = jamais rien reçu,
-- ce qui est la seule chose honnête à afficher tant que c'est vrai.
ALTER TABLE users ADD COLUMN alert_last_received_at TEXT;

-- Annonces apportées par ce transfert depuis toujours. Un cumul plutôt qu'un
-- compteur glissant : il répond à « est-ce que cela a déjà servi ? », qui est
-- la question qu'on se pose en configurant.
ALTER TABLE users ADD COLUMN alert_received_count INTEGER NOT NULL DEFAULT 0;
