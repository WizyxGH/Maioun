# Maïoun

Agrégateur **personnel** d'annonces de location à Nice. Ce n'est pas un énième
site immobilier : c'est un outil dont l'unique objectif est de **maximiser le
nombre de visites obtenues** — trouver vite les logements pertinents sur un
maximum de sources, éliminer les doublons et le bruit, évaluer chaque
opportunité, et permettre de contacter le bailleur en quelques secondes.

Ouvert sur un téléphone, il répond à une seule question :

> **Quelles sont les meilleures annonces que je dois contacter maintenant ?**

## Fonctionnalités

- **Collecte multi-sources** avec scheduler adaptatif : les sources productives
  sont interrogées plus souvent, les sources calmes espacées, les sources en
  erreur mises de côté — jamais de « tout le monde toutes les 10 minutes ».
- **Scraping poli par construction** : User-Agent identifiable, budgets de
  requêtes par source, cache ETag/304, arrêt anticipé en terrain connu, arrêt
  immédiat sur 429, arrêt définitif si une source refuse l'accès automatisé.
  Aucun contournement de protection, jamais.
- **Dédoublonnage** multi-signaux (téléphone, référence, GPS, prix, surface,
  textes) : une seule fiche par logement, **toutes** les occurrences et URLs
  d'origine conservées. Les cas ambigus ne sont pas fusionnés — un doublon
  visible vaut mieux qu'un logement disparu.
- **Fusion avec provenance** : téléphone du site d'agence + adresse exacte de
  Foncia + DPE de Saint Roch sur la même fiche ; les valeurs divergentes sont
  affichées, jamais écrasées en silence.
- **Quatre scores expliqués** — Match, Opportunité, Probabilité de visite,
  Risque — chacun avec ses raisons ligne à ligne et ses angles morts déclarés
  (« calculé sans le nombre de favoris »). Une donnée absente n'est jamais
  inventée.
- **Détection d'arnaques** : prix anormal, incohérences, formulations
  classiques (« clés par courrier », « virement avant visite ») — signalées,
  jamais bloquantes.
- **Distances** vers des points de référence privés (travail, gare), libellés
  neutres, coordonnées jamais versionnées.
- **Repère de loyer officiel** : le €/m² d'annonce publié chaque année par
  l'État (Carte des loyers, DHUP/ANIL), découpé par taille de logement. Il sert
  d'ancre au score de risque et s'affiche sur l'accueil avec sa fourchette —
  une valeur qu'on peut vérifier vaut mieux qu'un nombre écrit à la main.
- **Contact en mode manuel** : coordonnées + message prêt à envoyer
  ([Modifier] [Copier] [Ouvrir] [J'ai envoyé]) — rien ne part sans votre geste.
  Un mode automatique optionnel existe sous garde-fous stricts, **désactivé par
  défaut**.
- **Suivi** : statuts (Nouveau → Contacté → … → Loué), journal des contacts
  (avec les pièces déclarées jointes), consulté/archivé/favori persistants,
  classement affiné par vos préférences (affinité transparente), page Stats.
- **Un accueil qui fait le point**, pas une liste de plus : ce qui est arrivé
  depuis la dernière visite, ce qui attend un appel, et de quoi repartir. Chaque
  chiffre mène à ce qu'il compte.
- **Recherches enregistrées** : un jeu complet de critères et d'affinage, nommé,
  qu'on rappelle d'un geste. Ce sont des signets — les alertes, elles, suivent
  toujours les critères actifs.
- **Notifications** : un seul interrupteur. Allumé, l'alerte arrive par Web Push
  (téléphone, application fermée) et par bandeau quand le site est ouvert —
  chaque annonce signalée une seule fois, et jamais deux fois le même logement
  vu par deux sources.
- **Dossier de candidature** : vos pièces déposées une fois, rangées selon la
  liste limitative du décret n° 2015-1437, et accessibles depuis vos appareils
  — une candidature s'envoie d'où l'on est. Elles sont dans l'espace de
  fichiers du Worker, séparées par compte, et **jamais envoyées
  automatiquement** : c'est vous qui joignez.
- **Consulter est libre, agir demande un compte, candidater à votre place se
  paie.** Les annonces, la carte, les scores et les statistiques s'ouvrent sans
  rien créer. Favoris, suivi, alertes et dossier demandent un compte gratuit.
  Seule la candidature envoyée à votre place relève de l'offre payante — dont le
  péage est posé mais la vente pas encore ouverte : aucune clé de paiement n'est
  branchée, rien n'est encaissé, et l'écran le dit.
- **Hébergement : 0 €.** La collecte tourne où vous voulez — votre machine
  (fichier SQLite) ou GitHub Actions (Turso). Le site est servi par GitHub Pages
  et parle à un Worker Cloudflare, seul détenteur du jeton de la base. Tout cela
  tient dans les paliers gratuits.

## Architecture en bref

```
pnpm collect : Scheduler → Scrapers → Normalisation → Dédoublonnage
             → Scoring + distances → SQLite (local) ou Turso (publié)
le site      : GitHub Actions → Turso ← Worker Cloudflare ← Pages
```

Le site publié tient en deux étages : la **page de présentation** à la racine,
l'**application** sous `/app/`. Une seule origine, donc rien à ajouter aux
règles de cookies ni au CORS du Worker.

Quatre destinations, les mêmes sur téléphone et sur grand écran — Accueil,
Recherche, Favoris, Paramètres. L'accueil fait le point (ce qui est arrivé, ce
qui attend un appel) ; la recherche affiche les annonces et, sur ordinateur, le
plan à côté. Détails, carte des écrans et décisions :
[docs/architecture.md](docs/architecture.md).

**Stack** : TypeScript partout — monorepo pnpm, React + Vite + Tailwind CSS
v4 + shadcn/ui (frontend), Node 22 (collecteur), Worker Cloudflare (API), cheerio
(parsing), SQLite via `@libsql/client` (base), Vitest + Playwright (tests).

## Démarrage rapide

Prérequis : Node ≥ 20.10, pnpm 9 (`corepack enable`).

```bash
git clone <votre-fork> && cd maioun
pnpm install
pnpm collect      # collecte réelle → data/local.db (créée automatiquement)
pnpm dev          # l'interface, en mode démonstration
```

Pour voir VOS données, il faut le site publié : la collecte écrit dans Turso et
le site l'interroge via le Worker. Voir
[docs/deployment.md](docs/deployment.md).

Relancez `pnpm collect` quand vous voulez rafraîchir (le scheduler et les
budgets s'appliquent). `data/` est ignoré par git.

### Mode démo (sans réseau, sans base)

```bash
pnpm dev          # → http://localhost:5173, interface seule (pas de base)
```

C'est aussi l'environnement des tests. Installation détaillée et configuration
privée (`.env`) : [docs/deployment.md](docs/deployment.md).

### Notifications + collecte automatique

Pour être prévenu **sur votre téléphone** dès qu'une annonce entre dans vos
critères, sans lancer la collecte à la main :

1. **S'abonner aux notifications** depuis le site : cloche en haut à droite →
   « Alertes de nouvelles annonces ». Un seul interrupteur : allumé, vous êtes
   prévenu partout où c'est possible. Sur iPhone, ajoutez d'abord le site à
   l'écran d'accueil (Partager → Sur l'écran d'accueil), sans quoi Safari
   n'expose pas l'API du push.

   L'alerte porte la photo, le loyer, la surface, l'adresse, la disponibilité,
   le téléphone et la priorité — de quoi décider, et appeler, sans ouvrir le
   site. Elle exige les clés `VAPID_*` côté collecte (voir
   [docs/deployment.md](docs/deployment.md)).

2. **Planifier la collecte** (Windows) :

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\schedule-collect.ps1
   # toutes les 30 min par défaut ; -IntervalMinutes 15 pour changer,
   # -Remove pour désinstaller.
   ```

   C'est la collecte qui émet les notifications, sans serveur intermédiaire.
   Sur macOS/Linux, un `cron` équivalent : `*/30 * * * * cd <dépôt> && pnpm collect`.

## Commandes

| Commande                      | Effet                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev`                    | frontend en mode démo                                                           |
| `pnpm collect`                | un cycle de collecte (`-- --backfill`, `-- --source=<id>`, `-- --verbose`)      |
| `schedule-collect.ps1`        | planifie `pnpm collect` (Windows) pour des notifs automatiques (voir ci-dessus) |
| `pnpm db:migrate`             | applique les migrations                                                         |
| `pnpm test` / `pnpm test:e2e` | tests Node / scénarios Playwright                                               |
| `pnpm build:landing`          | construit la page de présentation publique (`landing/`)                         |
| `pnpm verify`                 | **tout** : format, lint, types, tests, end-to-end, secrets — avant tout commit  |
| `pnpm check:secrets`          | scanner de secrets seul                                                         |

## Documentation

| Document                                | Contenu                                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [architecture.md](docs/architecture.md) | composants et flux, puis par sections : scoring, détection de risque, dédoublonnage, scheduler, scraping, base de données, contact |
| [sources.md](docs/sources.md)           | étude datée des sources (robots.txt, verdicts, priorités)                                                                          |
| [deployment.md](docs/deployment.md)     | installation locale, `.env`, notifications, et option cloud gratuite (Turso + Actions + Pages)                                     |
| [privacy.md](docs/privacy.md)           | cartographie des données, les six barrières anti-fuite                                                                             |

Pour **ajouter une source**, le mode d'emploi vit dans l'en-tête de
[`packages/collector/src/sources/index.ts`](packages/collector/src/sources/index.ts).

## Principes non négociables

1. **Respect des sources** — pas de contournement de CAPTCHA, d'anti-bot, de
   rate limit ni de `robots.txt` ; une source hostile est abandonnée, pas
   forcée. Identité du bot toujours annoncée.
2. **Pas de données inventées** — un champ que la source ne publie pas est
   « inconnu », dans le modèle comme à l'écran.
3. **Rien de personnel dans le dépôt** — il est public ; six barrières
   automatiques l'assurent ([privacy.md](docs/privacy.md)).
4. **Aucun message sans action humaine** en mode manuel — le mode par défaut.
5. **Économie** — minimum de requêtes, d'écritures et de minutes CI pour le
   maximum d'information utile.

## Limites connues

- Le mode automatique de contact n'a **pas d'envoi implémenté** : les
  garde-fous existent et sont éprouvés — abonnement, interrupteur global,
  seuils, quotas, cooldown — mais rien ne part encore. C'est ce que l'offre
  payante couvrira, et c'est pourquoi elle n'est pas mise en vente.
- **L'offre payante n'encaisse rien** : aucune clé de paiement n'est branchée.
  La route de paiement répond franchement « pas configuré » plutôt que
  d'ouvrir une page qui échouerait.
- 57 sources actives (portails, réseaux et agences niçoises — dont la FNAIM,
  Century 21, Orpi, Arthurimmo, LocService, les adaptateurs génériques Apimo et
  La Boîte Immo/Hektor, et Studapart par API) ; PAP est implémentée mais
  désactivée (son WAF refuse les clients non-navigateurs, qu'on ne contourne
  pas) — l'[étude des sources](docs/sources.md) détaille chaque verdict.
- Distances à vol d'oiseau corrigées (× 1,3), pas des itinéraires.
- Leboncoin, SeLoger et Bien'ici restent **écartés** : DataDome + interdiction
  explicite de l'accès automatisé (Leboncoin), qu'on ne contourne pas. La voie
  conforme — l'import de leurs alertes e-mail — est en service : leurs annonces
  arrivent, sans que leurs pages soient jamais visitées.
- Les notifications ne sont pas de l'instantané : elles partent au rythme des
  collectes (tâche planifiée + intervalles adaptatifs par source).
- En mode local, la collecte tourne sur votre machine : ordinateur éteint, pas
  de collecte ni de notification. Le mode publié (GitHub Actions) lève cette
  limite.
- **Multi-compte** : les annonces sont communes, les décisions (favori, statut,
  archivage, recherches enregistrées) appartiennent à chacun. L'inscription est
  ouverte, par mot de passe ou avec un compte Google.

## Roadmap

- **Actuel** : pipeline complet, 57 sources actives (portails + réseaux +
  agences niçoises via les adaptateurs génériques Apimo et Hektor, Studapart
  par API publique) + PAP prête mais désactivée ; mode local zéro-cloud et mode
  publié (Actions + Pages + Turso) ; dédoublonnage multi-signaux ; contact
  manuel + relance et trace des pièces envoyées ; affinité et statistiques ;
  notifications Web Push et e-mail ; recherches enregistrées ; dossier de
  candidature partagé entre appareils ; import d'alertes e-mail ; comptes avec
  ou sans Google ; page de présentation publique ; frontend mobile ET grand
  écran (Tailwind CSS + shadcn/ui) ; docs et suite Vitest + Playwright.
- **Ensuite** : ouvrir réellement l'offre payante (les clés de paiement, puis
  l'envoi automatisé qu'elle couvre), davantage d'agences, relances
  automatisées, historique des prix enrichi.
- **Plus tard** : scores calibrés sur les résultats réels, scheduler optimisé
  dynamiquement.

## Troubleshooting

| Symptôme                                                                       | Cause probable et remède                                                                                                                                                           |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm collect` n'exécute aucune source                                         | Le scheduler estime qu'aucune n'est due. Vérifier la page Sources (Paramètres → Sources) ; pour en forcer une : `pnpm collect -- --source=<id>`.                                   |
| Une source est `blocked`                                                       | Elle a répondu 401/403 : le scraper s'arrête définitivement et ne tentera aucun contournement. Voir son verdict dans [docs/sources.md](docs/sources.md).                           |
| Une source est `cooldown`                                                      | HTTP 429 reçu : repos automatique (durée dans Paramètres → Sources), les autres sources continuent.                                                                                |
| 0 annonce alors que la collecte a réussi                                       | Les annonces sont hors critères (≤ 700 €, ≥ 20 m², Nice). Ouvrir « Filtres » et élargir, ou décocher les restrictions.                                                             |
| Un parser ne trouve plus de prix (warning « structure probablement modifiée ») | Le site a changé son HTML : suivre la procédure de réparation dans la section « scraping » de [docs/architecture.md](docs/architecture.md).                                        |
| Pas de notification                                                            | Vérifier les clés `VAPID_*` dans `.env`, et que les alertes sont activées depuis la cloche du site. Le notifieur ne signale que les annonces découvertes **après** son activation. |

## Licence

**Tous droits réservés** — voir [LICENSE](LICENSE). Le dépôt est public pour
être consultable et pour héberger son interface, mais le code n'est pas libre :
sa copie, son exécution et sa réutilisation demandent un accord écrit.

Quiconque l'exécuterait resterait seul responsable du respect des CGU des sites
consultés, de leur robots.txt et du droit applicable (RGPD compris). Ce projet
est conçu pour un usage personnel de recherche de logement, à faible volume.
