# Installation et usage

Deux moitiés, et une seule façon de les brancher :

- **la COLLECTE** tourne où vous voulez — votre machine (fichier SQLite) ou
  GitHub Actions (base Turso, PC éteint) ;
- **le SITE** est publié par GitHub Pages et parle à un **Worker Cloudflare**,
  seul détenteur du jeton de la base.

Coût : 0 €, tout tient dans les paliers gratuits.

> Il a existé un troisième chemin : un serveur local qui servait aussi le site
> depuis la machine. Il a été retiré — deux chemins pour le même écran, c'était
> deux fois les mêmes cas à tenir, et le site publié fait tout ce que l'autre
> faisait.

## Démarrage

```bash
pnpm install
pnpm collect      # collecte réelle → data/local.db (créée automatiquement)
pnpm verify       # format + lint + types + tests + end-to-end + secrets
```

- La base locale est un fichier SQLite (`data/local.db`, ignoré par git).
- Les migrations s'appliquent automatiquement au démarrage de la collecte.
- Relancez `pnpm collect` quand vous voulez rafraîchir ; le scheduler, les
  budgets et le cache s'appliquent comme prévu.

Pour VOIR ces données, il faut le site publié (plus bas) : c'est lui, via le
Worker, qui les affiche. `pnpm dev` ne montre que le mode démonstration.

## Configuration privée (`.env`)

Copiez `.env.example` vers `.env` (ignoré par git) et renseignez ce qui vous
concerne.

**CE FICHIER RÉTRÉCIT, ET C’EST VOULU.** Tout ce qui se règle depuis le site y
est désormais interdit : profil locataire, adresses de référence, critères,
préférences d’alerte, accès abonnés. Un réglage à deux domiciles est un réglage
dont personne ne sait lequel fait autorité — et la panne qui en résulte est
muette : le fichier est rempli, la commande n’a aucune raison de se plaindre, et
des brouillons partent aux agences avec un ancien numéro de téléphone.

Ce qui reste ici ne peut pas vivre ailleurs : ce sont les valeurs avec
lesquelles on OUVRE la base, ou celles qui déchiffrent ce qu’elle contient. Les
ranger dedans reviendrait à mettre la clé dans le coffre.

| Variable                                         | Rôle                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `BEP_SUBSCRIBER_USER` / `_PASSWORD`              | Accès abonné BEP payé, si vous en avez un (§6).                       |
| `VAPID_PUBLIC_KEY` / `_PRIVATE_KEY` / `_SUBJECT` | Notifications Web Push des nouvelles annonces (§29, voir ci-dessous). |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`        | Base cloud. Absents, la collecte écrit dans le fichier local.         |
| `COLLECTOR_USER_AGENT`                           | User-Agent du collecteur (identifiable, honnête — §10).               |

`.env` est chargé automatiquement par les commandes de collecte. Ces valeurs
sont privées : jamais committées, jamais journalisées (§26). Les secrets du
Worker, eux, ne passent PAS par `.env` — voir l'étape 4.

## Notifications Web Push (§29)

C'est la COLLECTE qui émet, directement vers le service de push du navigateur :
aucun serveur intermédiaire. Sans les clés `VAPID_*`, le canal reste
silencieusement désactivé. Le notifieur ne signale que les annonces découvertes
**après** son activation, chacune une seule fois — et jamais deux fois le même
logement vu par deux sources.

1. **Générer les clés**, une fois :

   ```bash
   npx web-push generate-vapid-keys
   ```

   ```
   VAPID_PUBLIC_KEY=…      # part aussi dans le site : ce n'est PAS un secret
   VAPID_PRIVATE_KEY=…     # reste côté collecte
   VAPID_SUBJECT=mailto:vous@example.invalid
   ```

   Sans la clé publique au build du site, le navigateur ne peut pas s'abonner.

2. **S'abonner** : onglet Notifications → **Activer**. La page indique ensuite
   ce qui fonctionne et ce qui bloque.

Sur **Android**, l'alerte porte la photo, le loyer, le quartier, le téléphone et
deux boutons — de quoi décider et appeler sans ouvrir le site. Sur **iPhone**,
il faut d'abord ajouter le site à l'écran d'accueil (iOS 16.4+), et Apple
n'affiche ni image ni boutons : titre et texte seulement.

## Régler les critères de recherche

**Depuis le site** : « Trier et filtrer » → « Ce qui est collecté et signalé ».
Le budget et la surface s'appliquent immédiatement ; les exclusions (colocation,
location étudiante) prennent effet à la collecte suivante — elles demandent le
texte de l'annonce, pas un nombre.

Il n'y a **plus de fichier de configuration**. `config/search.json` a été
retiré : il portait les mêmes réglages que la base, les deux ne disaient pas
toujours la même chose, et rien n'indiquait lequel faisait autorité. Les
critères vivent dans la table `app_settings`, ce qui leur permet de suivre d'un
appareil à l'autre — et, depuis les comptes, d'appartenir à chacun. Les valeurs
de départ sont celles de `packages/shared/src/criteria.ts`.

## Points de référence (§20)

Le temps de trajet affiché sur chaque annonce se compte depuis ces adresses —
c'est donc lui qui décide, en pratique, de ce qu'on regarde en premier.

Ils se règlent **depuis le site** : Paramètres → « Points de référence ». On y
saisit une adresse en clair (« 12 rue X, Nice »), pas des coordonnées ; elle est
géocodée à la collecte suivante, une fois, puis mise en cache. Les distances ne
changent donc pas dans la seconde.

**L'écran est la seule source.** Les variables `REFERENCE_*` de `.env` ne sont
plus lues par rien : un fichier posé sur la machine de collecte ne peut pas
porter les adresses de plusieurs comptes, et une adresse saisie depuis le
téléphone y aurait paru sans effet. Rien de réglé depuis le site veut donc dire
aucun point de référence — les annonces sont alors classées sans temps de
trajet, ce que la fiche dit au lieu de l'inventer.

Ces adresses désignent un lieu de travail et un domicile. Elles vivent dans la
base à jeton, jamais dans le dépôt (§26).

## Commandes utiles

| Commande                     | Effet                                                |
| ---------------------------- | ---------------------------------------------------- |
| `pnpm collect`               | un cycle de collecte                                 |
| `pnpm collect -- --verbose`  | collecte avec journalisation détaillée               |
| `pnpm collect -- --backfill` | descend dans l’historique                            |
| `pnpm publish:turso`         | pousse l'inventaire local vers la base cloud         |
| `pnpm query "select …"`      | lit la base ; refuse tout ce qui n'est pas un SELECT |
| `pnpm db:mirror`             | tire un miroir local de la base, dans `.data/`       |
| `pnpm db:dump`               | sauvegarde la base en `.sql` portable, dans `.data/` |
| `pnpm query --local "…"`     | lit le miroir : gratuit, hors ligne, et daté         |
| `pnpm serve:local`           | sert l'API du site à partir du miroir, hors ligne    |
| `pnpm email:test`            | aperçu de l’alerte e-mail ; `--send` pour un essai   |
| `pnpm dev`                   | interface seule, en mode démonstration               |
| `pnpm verify`                | format + lint + types + tests + end-to-end + secrets |

La page « Sources » du site montre l'état et le dernier passage de chaque
source : c'est là qu'on vérifie que tout tourne.

## Mise en ligne

```
GitHub Actions (toutes les 15 min) → collecte 24/7 et notifications Web Push
        ↓ écrit                      (réveillée par le Worker, voir plus bas)
Turso (SQLite cloud)          → base PRIVÉE, jeton jamais publié
        ↑ lit
Worker Cloudflare             → l'API, les sessions, le réveil de la collecte,
        ↑ appelle                et le SEUL détenteur du jeton Turso
GitHub Pages                  → le site (bundle public, sans aucun secret)
```

**POURQUOI UN WORKER, alors que le site parlait directement à Turso.** Le jeton
vivait alors dans le navigateur. Il ouvrait toute la base — donc aucun mot de
passe ne pouvait être vérifié : un écran de connexion posé devant se serait
contourné en changeant une variable dans la console. Le Worker déplace ce jeton
hors de portée ; le navigateur ne reçoit plus qu'un cookie de session signé.

C'est ce qui rend le **multi-compte** possible : les annonces sont communes,
mais favoris, suivi, archivage et recherches enregistrées appartiennent à
chacun (`listing_user_state`).

### 1. Base Turso

```bash
turso auth login                        # compte gratuit (navigateur)
turso db create maioun
turso db show maioun --url          # → TURSO_DATABASE_URL
turso db tokens create maioun       # → TURSO_AUTH_TOKEN
```

Placez ces deux valeurs dans `.env`, appliquez le schéma, puis publiez ce que
vous avez déjà collecté :

```bash
pnpm db:migrate
pnpm publish:turso        # --dry-run pour voir sans écrire
```

Le schéma part en entier ; les données seulement pour les annonces et l'état des
sources — jamais les caches de géocodage ni l'historique de contacts.

#### Le quota de lectures, et ce qu'il fait quand il tombe

Turso facture les **lignes lues**, avec un plafond mensuel. Le
**24 septembre 2026** il a été atteint : la base a répondu
`BLOCKED: SQL read operations are forbidden` à _tout_ — les requêtes, mais
aussi l'export, donc aucune copie de secours ne pouvait plus être tirée. La
collecte a échoué en boucle à partir de 03:37, dernier passage réussi à 03:22.

Deux enseignements, et les deux sont dans le dépôt.

**Le miroir se tire AVANT d'en avoir besoin.** `pnpm db:mirror` entretient un
réplica embarqué dans `.data/` (hors Git) ; `pnpm query --local` le lit sans
rien coûter et sans réseau. Tiré à temps, il aurait permis d'enquêter pendant
la panne. Il utilise un client libsql récent, installé sous l'alias
`@libsql/sync` : la plateforme refuse le protocole de synchronisation de la
version que la collecte emploie par ailleurs.

**Le site aussi doit pouvoir tomber en secours.** Le miroir servait aux
requêtes d'enquête ; il manquait de quoi le REGARDER. `pnpm serve:local` sert
la même API que le Worker — le même `server/routes.ts`, aucun code en double —
contre le fichier local, sur `http://localhost:8787`. Le site s'y branche :

```bash
pnpm db:mirror                                  # une fois, tant que Turso répond
pnpm serve:local                                # un terminal
VITE_API_URL=http://localhost:8787 pnpm dev     # un autre
```

**Ce que le serveur local ne sait PAS faire.** Cinq routes appartiennent au
Worker et n'ont pas d'équivalent ici, parce qu'elles demandent un secret ou un
service extérieur : l'adresse e-mail du compte, l'adresse de transfert des
alertes, l'abonnement, et les identifiants de portails. Deux sous-écrans des
Paramètres restent donc vides en local — « Votre offre » et « Accès
supplémentaires ». Tout le reste fonctionne.

`/api/me` fait exception : le serveur local y répond, parce qu'il connaît la
réponse. Sans elle, le site se croyait devant un inconnu — « Connectez-vous
pour continuer » sur les Paramètres, et une liste filtrée sur le catalogue au
lieu des critères du compte.

Il n'a qu'un utilisateur — c'est votre machine, il n'y a personne d'autre —,
n'écoute que la boucle locale, et annonce au démarrage quel fichier il sert et
de quand il date. `MAIOUN_LOCAL_DB` en désigne un autre.

**Quand le quota est déjà tombé, l'attente se délègue.**
`pnpm db:mirror -- --attendre` réessaie toutes les quinze minutes et tire la
copie à la première seconde où c'est possible — une requête minuscule par quart
d'heure. Rien n'est perdu pendant ce temps : les favoris, le suivi et les
archivages restent intacts dans Turso, seulement hors d'atteinte.

**Le site sans le PC : une base de secours sur D1.** Le serveur local demande
une machine allumée. Pour que le site PUBLIÉ survive à un quota fermé, le
Worker sait se replier sur une copie D1 — même plateforme que lui, gratuite, et
remise à zéro chaque jour au lieu de chaque mois.

```bash
npx wrangler d1 create maioun-secours     # rend le database_id
pnpm db:mirror && pnpm db:dump            # la copie, tant que Turso répond
npx wrangler d1 execute maioun-secours --remote --file=.data/sauvegarde-<date>.sql
```

Puis décommenter le bloc `[[d1_databases]]` de `wrangler.toml` avec ce
`database_id`, et déployer. **Sans ce liage, rien ne change** : le Worker le
traite comme facultatif.

LE REPLI EST EN LECTURE SEULE, et à trois conditions — un refus de quota
avéré, un liage présent, et une requête que la copie peut servir : tout GET,
plus LA CONNEXION, qui est un POST mais ne fait que lire. Sans cette exception
le secours n'aurait servi que ceux ayant déjà une session ouverte. Consulter fonctionne alors ; poser un
favori, non. Deux bases qu'on écrirait toutes les deux divergeraient, et ce
favori disparaîtrait au retour de Turso sans que rien ne le signale. Les
réponses ainsi servies portent `X-Maioun-Secours` : ce n'est pas l'état du
jour, et l'écran doit pouvoir le dire.

Une panne qui n'est PAS un refus de quota ne se replie pas : elle reste
visible. Masquer une vraie panne derrière les données d'hier est pire que de
l'afficher.

**Une sauvegarde qui survit à la plateforme.** Le miroir est un réplica : il
suit la base, et ne protège donc de rien si c'est la base qu'on perd.
`pnpm db:dump` en tire un `.sql` ordinaire dans `.data/` — schéma, données,
index — que n'importe quel SQLite relit, et qui remplit aussi une base de
secours (`wrangler d1 import`).

```bash
pnpm db:mirror        # la copie, tant que Turso répond
pnpm db:dump          # .data/sauvegarde-AAAA-MM-JJ.sql
```

Les tables sont écrites PARENTS D'ABORD : sept d'entre elles portent des clés
étrangères, que SQLite ignore par défaut mais que D1 applique. L'aller-retour a
été vérifié sur la base du 24 septembre 2026, `PRAGMA foreign_keys = ON` :
10 944 lignes, 26 tables, 53 index, aucune violation, empreintes des 2 285
fiches identiques — et `pnpm serve:local` sert la restauration comme
l'original, mêmes 208 annonces dans les critères.

CE FICHIER CONTIENT DES DONNÉES PERSONNELLES : adresses e-mail, empreinte de
mot de passe, abonnements aux notifications, identifiants de portails. Il reste
dans `.data/`, que `.gitignore` refuse en entier. Le dépôt est public.

**Depuis un téléphone, sur le réseau du logement.** Par défaut le serveur
n'écoute que la boucle locale : un téléphone ne peut pas l'atteindre, et c'est
la bonne valeur par défaut. Deux interrupteurs l'ouvrent, et il faut les deux :

```bash
MAIOUN_LOCAL_RESEAU=1 pnpm serve:local        # affiche l'adresse à taper
VITE_API_URL=http://192.168.1.x:8787 pnpm dev:reseau
```

Le serveur annonce alors les adresses privées de la machine, et AVERTIT :
il n'y a ni mot de passe ni session — le serveur local n'a qu'un utilisateur —
donc quiconque partage ce Wi-Fi peut lire vos annonces et poser un favori. Chez
soi c'est sans conséquence ; sur le réseau d'un café, non. La règle d'origine
s'élargit exactement en même temps, aux seules plages privées de la RFC 1918.

Le site reste en HTTP sur une adresse IP : ce n'est pas un contexte sécurisé,
donc **pas de notifications push ni d'installation sur l'écran d'accueil** de
ce côté-là. Consulter, filtrer, mettre en favori : tout le reste fonctionne.

**Et l'on peut travailler ENTIÈREMENT hors de Turso.** `MAIOUN_LOCAL=1`
l'emporte sur `TURSO_DATABASE_URL`, même présente dans le `.env` — sans quoi il
fallait commenter une ligne, et penser à la remettre. La collecte écrit alors
dans `data/local.db`, que le serveur local sert au site :

```bash
MAIOUN_LOCAL=1 pnpm db:migrate     # le schéma dans le fichier local
MAIOUN_LOCAL=1 pnpm collect        # une vraie collecte, sans toucher Turso
pnpm serve:local                   # un terminal
VITE_API_URL=http://localhost:8787 pnpm dev   # un autre
```

L'interrupteur ne s'allume que sur « 1 », et chaque commande dit quelle base
elle vise : une collecte qui écrirait dans un fichier local en croyant nourrir
la production serait pire que pas de collecte du tout.

**Une requête de passage sans index se paie tous les quarts d'heure.** Les
retours en ligne et les baisses de prix se lisaient dans `listing_history` par
balayage complet — une table qui ne perd jamais une ligne —, deux fois par
passage, quatre-vingt-seize fois par jour. La migration `0047` ajoute l'index
`(change, recorded_at)`, et `db/lectures-par-passage.test.ts` lit le plan de
SQLite pour qu'une prochaine requête de passage ne reparte pas en balayage.

### 2. Le site — GitHub Pages

**Settings → Pages**, source « **GitHub Actions** ». Une fois, et c'est tout :
le workflow ne peut pas l'activer lui-même, son jeton peut déployer sur Pages
mais pas créer le site. `deploy-frontend.yml` publie ensuite à chaque push.

Tant que le site n'est relié à aucune API, il affiche un écran de connexion —
jamais de données fictives.

### 3. Collecte planifiée — GitHub Actions

**Settings → Secrets and variables → Actions** :

| Secret                                    | Valeur                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | ceux de l'étape 1                                                                                 |
| `VAPID_PUBLIC_KEY` / `_PRIVATE_KEY`       | pour les notifications (§29)                                                                      |
| `EMAIL_API_KEY`                           | le canal e-mail qui double le push — **la même clé Resend que le Worker**                         |
| `CREDENTIALS_KEY`                         | déchiffre les accès abonnés déclarés depuis le site — **exactement la même valeur que le Worker** |
| `IMAP_USER` / `IMAP_APP_PASSWORD`         | la boîte où arrivent les alertes des portails (§6, §10)                                           |
| `BEP_SUBSCRIBER_USER` / `_PASSWORD`       | optionnel (amorçage d'un accès abonné payé)                                                       |

Et les _variables_ (onglet « Variables », pas « Secrets ») :

| Variable                     | Rôle                                                                                                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUD_COLLECT_ENABLED`      | `true` allume la collecte planifiée. Absente, `collect.yml` **ne fait rien** : un fork ne consomme rien et ne déclenche aucune action involontaire.                                                                                      |
| `API_URL`                    | l'URL du Worker, qui relaie en https les photos publiées en http — sans elle la notification s'affiche nue                                                                                                                               |
| `EMAIL_FROM`                 | l'expéditeur, le même que celui du Worker                                                                                                                                                                                                |
| `IMAP_HOST` / `IMAP_MAILBOX` | la boîte à lire ; défauts `imap.gmail.com` et la boîte de réception                                                                                                                                                                      |
| `ALERT_ADDRESS_TEMPLATE`     | **le même gabarit que le Worker.** Le Worker MONTRE l'adresse à chaque compte, le collecteur s'en sert pour ROUTER ce qui arrive : configuré d'un seul côté, l'écran affiche une adresse dont les messages n'appartiendraient à personne |
| `AUTO_CONTACT_ENABLED`       | interrupteur global du contact automatique (§23). Absent = OFF                                                                                                                                                                           |

**Les valeurs manquantes ne font pas d'erreur, elles font du silence.** Les
quatre variables IMAP ont manqué longtemps : la source des alertes e-mail se
désactivait à chaque passage sans rien dire, et ne fonctionnait que sur la
machine de son propriétaire — tout un pan du gisement (Leboncoin, SeLoger)
absent, sans qu'aucune collecte ne rougisse.

Ce qui ne figure **pas** ici se déduit du dépôt et n'a donc pas à être écrit :
l'adresse des liens d'alerte et l'identité annoncée aux sites viennent de
`GITHUB_REPOSITORY`, que GitHub tient à jour même après un renommage.

Les points de référence ne figurent nulle part ici : ils se règlent depuis le
site (Paramètres → Adresses de référence) et vivent en base, par compte. Ce sont
des coordonnées qui révèlent un domicile et un lieu de travail — le seul endroit
où elles doivent vivre est celui que l’utilisateur contrôle depuis son écran.

### 4. L'API et les comptes — Worker Cloudflare

```bash
cd packages/worker
npx wrangler login
npx wrangler deploy        # répondre « Y » au sous-domaine workers.dev
pnpm run secrets           # dépose les trois secrets, sans les afficher
```

`pnpm run secrets` lit `TURSO_DATABASE_URL` et `TURSO_AUTH_TOKEN` dans votre
`.env` et les envoie directement à wrangler : rien ne passe par un
copier-coller, où un jeton de deux cents caractères se rate d'un espace — et
l'erreur ne se voit alors qu'à la première requête du site, sous la forme d'une
panne sans rapport apparent.

`SESSION_SECRET` est tiré au hasard par le script. Il ne sert qu'à signer les
cookies de session : personne n'a à le connaître, et le perdre ne fait que
déconnecter tout le monde.

Vérifiez ensuite avec `npx wrangler secret list` — trois noms doivent
apparaître, sans leurs valeurs. **Une liste vide (`[]`) signifie que le Worker
répondra en erreur à la première requête.**

Puis, une fois par personne :

```bash
pnpm --filter @maioun/worker user:add
```

La commande demande un identifiant et un mot de passe **sans l'afficher**, et
n'écrit que son empreinte (PBKDF2, 210 000 tours). Elle ne prend pas le mot de
passe en argument : il resterait dans l'historique du terminal.

Cette commande sert à **amorcer** une installation, ou à créer un compte sans
passer par le site. L'inscription est ouverte depuis, par mot de passe ou avec
un compte Google : ce qui protège de l'inscription en masse n'est plus une porte
fermée mais trois barrières — trois inscriptions par heure et par origine, une
adresse dont le domaine existe, et une confirmation par e-mail (voir
`packages/worker/src/signup.ts`).

Enfin, deux réglages se répondent :

- `ALLOWED_ORIGIN` dans `packages/worker/wrangler.toml` = l'adresse du site
  (`https://<vous>.github.io`). Un `*` serait refusé par les navigateurs dès
  lors qu'on envoie un cookie — et il le serait à raison.
- `VITE_API_URL` du build du site = l'URL du Worker.

### 5. Le réveil de la collecte — Cron Trigger du Worker

**C'EST LUI QUI LANCE LES COLLECTES, pas le `schedule` de GitHub.** Ce dernier
met les réveils planifiés en file et les écarte quand elle est chargée, sans le
dire : le 2026-09-07, trois passages sur quarante-huit demandés. Une base sans
collecte n'a l'air de rien — la dernière a réussi, elle date simplement.

Les Cron Triggers de Cloudflare tiennent l'heure et sont compris dans le plan
gratuit. Le Worker ne collecte pas (il n'a ni Node ni le temps qu'il faudrait) :
il demande à GitHub d'exécuter `collect.yml`, ce qui compte comme un
déclenchement **manuel** et échappe donc à la file des `schedule`.

Un seul geste, une fois :

```bash
cd packages/worker
npx wrangler secret put GITHUB_DISPATCH_TOKEN
```

Un jeton **fin** (fine-grained), sur ce seul dépôt, avec la permission
« Actions: Read and write » et rien d'autre : le Worker n'a besoin que d'appuyer
sur un bouton. Le dépôt visé est désigné par `GITHUB_REPOSITORY_ID` dans
`[vars]` — son identifiant NUMÉRIQUE, qui survit aux renommages là où le nom les
subit :

```bash
gh api repos/<propriétaire>/<nom> --jq .id
```

Sans le jeton, le réveil se tait **et l'écrit dans le journal** : `npx wrangler
tail` le montre (« collecte NON demandée : GITHUB_DISPATCH_TOKEN absent »). Le
`schedule` du workflow reste en place comme filet — il ne coûte rien.

### Entrer avec un compte Google (§26) — option gratuite à activer

**Ce qu'elle apporte.** Consulter est libre : le moment où l'on demande un
compte n'est plus l'arrivée sur le site mais le premier geste — un favori. À
cet instant, réclamer un mot de passe à choisir puis une confirmation par
courriel à attendre fait renoncer. Google rend une adresse **déjà vérifiée** :
un seul geste, rien à recevoir. C'est aussi le seul chemin d'inscription qui
fonctionne tant que l'envoi d'e-mails n'est pas configuré.

**Ce qu'elle coûte.** Google saura quand quelqu'un se connecte à Maïoun. C'est
modeste pour une recherche de logement, mais ce n'est pas rien, et c'est
irréversible pour les comptes créés ainsi. Le mot de passe reste le second
chemin, toujours disponible : sans identifiant d'application configuré, le
bouton ne s'affiche simplement pas.

**1. Créer l'identifiant OAuth.** Google a déplacé cet écran : le chemin
_API et services → Identifiants_ ne le propose plus, et l'entrée _ID client
OAuth_ y reste introuvable. Elle vit désormais dans **Google Auth Platform**,
[console.cloud.google.com/auth/clients](https://console.cloud.google.com/auth/clients).

Trois choses doivent être en place, dans cet ordre, sans quoi le bouton
_Créer un client_ est absent ou refusé :

1. **un projet sélectionné** dans la barre du haut — sans projet, la console
   n'affiche aucun de ces écrans ;
2. **la configuration de l'application** (_Google Auth Platform → Démarrer_ ou
   _Branding_) : nom de l'application, adresse d'assistance, audience
   **Externe**, adresse de contact. C'est l'ancien « écran de consentement », et
   c'est lui qui manque le plus souvent ;
3. alors seulement **_Clients → Créer un client_ → type Application Web**.

Tant que l'application reste en mode _Test_, **seuls les comptes inscrits comme
utilisateurs de test peuvent se connecter** : s'y ajouter soi-même, sinon Google
refuse la connexion sans que le site puisse l'expliquer. Publier l'application
ne demande aucune vérification tant que les portées se limitent à `openid`,
`email` et `profile`.

Y déclarer comme **origine JavaScript autorisée** l'adresse EXACTE du site,
schéma et hôte, sans chemin ni barre finale :

```
https://wizyxgh.github.io
```

Aucun **URI de redirection** n'est nécessaire : le jeton est rendu dans la
page, sans redirection. Google demandera aussi de remplir l'écran de
consentement — nom de l'application et adresse de contact suffisent tant que
les portées restent `openid`, `email` et `profile`.

**2. Le donner au Worker**, qui VÉRIFIE les jetons :

```toml
# packages/worker/wrangler.toml
GOOGLE_CLIENT_ID = "….apps.googleusercontent.com"
```

Ce n'est pas un secret — Google le publie, il voyage dans la page — mais ce
n'est pas décoratif pour autant : c'est en comparant cette identité à celle
que porte le jeton qu'on refuse un jeton émis pour une **autre** application.
Sans ce contrôle, n'importe quel site utilisant Google pourrait rejouer les
jetons de ses propres visiteurs pour entrer ici. C'est la vérification qu'on
oublie, et la plus traître.

**3. Le donner au site**, qui l'AFFICHE. Dans le dépôt GitHub → _Settings_ →
_Secrets and variables_ → _Actions_ → onglet **Variables** (et non _Secrets_) →
`GOOGLE_CLIENT_ID`, même valeur. Puis relancer le déploiement du site.

**Si l'un des deux manque**, rien ne ment : absent côté Worker, la route répond
501 ; absent côté site, le bouton ne s'affiche pas. Dans les deux cas le mot de
passe continue de fonctionner (§17).

**Un compte existant est RELIÉ, jamais dupliqué.** Quelqu'un inscrit par mot de
passe qui clique un jour « Continuer avec Google » retrouve son compte, ses
favoris et son dossier : le rattachement se fait sur l'adresse, et il est sûr
parce que Google atteste l'avoir vérifiée. Le lien est ensuite tenu par
l'identifiant stable du compte Google, jamais par l'adresse — celle-ci peut
changer, le compte reste le même.

### Mot de passe oublié (§26) — option gratuite à activer

Sans elle, un mot de passe perdu est un compte perdu : ses favoris, son suivi,
ses pièces déposées et ses recherches enregistrées avec. Le seul recours est
alors `pnpm --filter @maioun/worker user:add`, relancé sur l'identifiant
existant depuis une machine qui a accès à la base.

Trois choses à mettre en place, dans cet ordre :

**1. Une adresse par compte.** Un compte n'en avait pas — la réinitialisation
n'aurait eu nulle part où écrire. Elle se saisit à la création, et se rattrape
en relançant la même commande sur un identifiant existant : les champs laissés
vides ne sont pas écrasés.

```bash
pnpm --filter @maioun/worker user:add
```

**2. Un service d'envoi.** Un Worker Cloudflare ne peut pas ouvrir de connexion
SMTP : il lui faut une API HTTP. Le collecteur, lui, le pourrait, mais il ne
tourne que sur minuterie — personne n'attend son mot de passe deux heures.

[Resend](https://resend.com) est employé par défaut : palier gratuit **sans
carte bancaire**, trois mille messages par mois, et son expéditeur de démarrage
fonctionne sans posséder de domaine. Le fournisseur est isolé dans
`packages/collector/src/notify/mailer.ts` — en changer revient à réécrire une
vingtaine de lignes, sans toucher au reste.

```bash
npx wrangler secret put EMAIL_API_KEY   # la clé, jamais dans un fichier versionné
```

**3. L'expéditeur et l'adresse du site**, dans `wrangler.toml` :

```toml
EMAIL_FROM = "Maïoun <onboarding@resend.dev>" # secret-scan-ignore
SITE_URL = "https://<vous>.github.io/Maioun/app/"
```

Puis `npx wrangler deploy`.

Tant que l'un des trois manque, l'écran « mot de passe oublié » **dit qu'il
n'est pas configuré** au lieu d'annoncer un message qui ne partira jamais (§17).

**4. Les alertes par e-mail** partent de la collecte, pas du Worker : la même
clé doit AUSSI être déposée côté GitHub (secret `EMAIL_API_KEY`, variable
`EMAIL_FROM`). Un récapitulatif par passage part vers l'adresse vérifiée du
compte, si « E-mail » est coché dans Paramètres → Notifications.

L'expéditeur `onboarding@resend.dev` ne livre qu'à l'adresse du compte Resend : <!-- secret-scan-ignore -->
créez ce compte avec l'adresse vérifiée dans Maïoun, ou vérifiez un domaine
chez Resend pour écrire à d'autres.

Avant de déposer la clé, validez-la depuis la machine, avec `EMAIL_API_KEY` et
`EMAIL_FROM` dans `.env` :

```bash
pnpm email:test          # aperçu du message, rien n'est envoyé
pnpm email:test --send   # un envoi d'essai ; aucune annonce n'est marquée signalée
```

CE QUI EST GARANTI PAR CONSTRUCTION, et qu'il vaut mieux connaître avant de
toucher à ce code :

- **la demande répond toujours la même chose**, que l'identifiant existe ou non.
  Un formulaire qui dirait « compte inconnu » serait un annuaire de comptes,
  interrogeable en boucle ;
- **le jeton n'est pas stocké**, seule son empreinte SHA-256 l'est. Une base qui
  fuite ne doit pas livrer de laissez-passer utilisables ;
- **il expire en une heure et ne sert qu'une fois** — un lien qui traîne des
  mois dans une boîte est une porte laissée entrouverte, et une boîte se
  compromet ;
- **une nouvelle demande annule la précédente** : deux liens valables à la fois
  doublent la surface d'attaque sans rendre service.

### Il n'y a plus d'accès direct à Turso

Le site a longtemps su interroger la base lui-même, avec une adresse et un jeton
saisis à la première visite. Ce chemin a été retiré : le jeton ouvrait TOUTE la
base, donc aucun mot de passe ne pouvait être vérifié devant — les comptes
n'existaient tout simplement pas de ce côté-là. Il redemandait par ailleurs ces
identifiants à chaque vidage de cache, et ne savait faire ni les pièces du
dossier, ni l'abonnement aux notifications.

`VITE_API_URL` est donc obligatoire pour un site utilisable.

## La page de présentation (`landing/`)

Un site statique **séparé de l'application**, destiné au public qui découvre le
projet. Deux publics, deux rythmes de publication, deux poids : un visiteur n'a
aucune raison de télécharger React, Leaflet et quarante écrans pour lire une
page.

```bash
pnpm build:landing        # → landing/dist (≈ 6 ko compressés, aucun JavaScript)
pnpm --filter @maioun/landing dev
```

Elle n'importe **aucun paquet du dépôt** — ses couleurs sont recopiées, pas
partagées — et c'est ce qui lui permet d'être publiée seule.

**ELLE N'ÉTAIT PUBLIÉE NULLE PART.** Le workflow ne montait que `frontend/dist` :
la page existait, soignée, et personne ne pouvait l'atteindre. Ses boutons
« Accéder » ne menaient qu'à une ancre d'elle-même, et la section d'accès
renvoyait à un sous-domaine qui n'existe pas. Corrigé le 2026-09-09.

**La structure publiée :**

| Adresse                                 | Contenu                 |
| --------------------------------------- | ----------------------- |
| `https://<vous>.github.io/<dépôt>/`     | la page de présentation |
| `https://<vous>.github.io/<dépôt>/app/` | l'application           |

Un seul artefact, un seul déploiement, **une seule origine** — donc rien à
ajouter aux règles de cookies ni au CORS du Worker. Le workflow construit les
deux, les assemble, et refuse de publier si l'un des deux manque : une copie
muette qui échoue publierait une racine sans application, au vert.

Les liens de la page sont **relatifs** (`app/`) : ils suivent le dépôt où qu'il
soit hébergé, là où une adresse en dur casserait au premier changement de
domaine.

**CE QUI CASSE EN DÉPLAÇANT L'APPLICATION SOUS `/app/`**, et qu'il faut savoir :
les favoris de navigateur pointant l'ancienne adresse, la PWA déjà installée (à
réinstaller) et les abonnements Web Push (à refaire — ils sont liés au chemin du
service worker). `SITE_URL` a été recalé dans `wrangler.toml` et dans
`cli/collect.ts` : sans cela, les liens de réinitialisation et les
notifications déposeraient les gens sur le pitch, sans le jeton attendu.

**Le tarif attend toujours une décision.** La page annonçait « 50 € par mois »
pour un ensemble de fonctionnalités devenues gratuites, et affirmait qu'« il n'y
a pas d'inscription libre » — deux affirmations que le changement de modèle a
rendues fausses. Elles sont corrigées : la page dit ce qui est vrai aujourd'hui
— consulter est libre, le compte est gratuit — et **n'écrit aucun prix** pour la
candidature automatisée, qui n'existe pas encore. En afficher un pour une
fonctionnalité absente serait une promesse ; en afficher un pour ce qui est
gratuit serait un mensonge (§17). Le montant s'écrira à un seul endroit, dans la
section « Tarif ».
