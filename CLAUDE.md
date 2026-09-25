# Travailler sur Maïoun

Agrégateur de locations sur Nice. Une collecte lit ~216 sources, dédoublonne,
score, puis alerte. `README.md` décrit le produit, `docs/architecture.md` le
flux, `docs/sources.md` chaque source. **Ce fichier-ci ne dit que ce qu'il ne
faut pas se tromper.**

## Une seule commande avant de committer

```bash
pnpm verify
```

Format, lint, **les trois compilations**, tests Node, tests frontend, scénarios
end-to-end, scanner de secrets. Les lancer séparément fait oublier la
compilation du projet de tests (`tsconfig.test.json`), qui a déjà fait rougir
l'intégration continue.

Pour aller plus vite pendant l'écriture, viser ce qu'on touche :

```bash
npx vitest run --no-file-parallelism <chemin>   # TOUJOURS --no-file-parallelism
```

Sans ce drapeau, la machine sature et rend des « worker exited » qui ne sont
pas des régressions.

## Ce qu'un agent ne fait JAMAIS sans qu'on le lui demande

- **Lancer une collecte** (`pnpm collect`) ou un rejeu (`pnpm reprocess`) : ils
  sollicitent des sites réels et écrivent en production.
- **Écrire dans Turso.** Lire est permis, et suffit presque toujours.
- **Poser ou contourner `MAIOUN_ALERTS`** : cet interrupteur décide si les
  alertes partent. Une valeur mal posée les a déjà fait taire 2 h 30.
- **Déployer** (`wrangler deploy`, déclencher un workflow) ou envoyer un e-mail.
- **`git stash`** : du travail a déjà été perdu ainsi. Pour vérifier qu'un test
  échoue sans un correctif, copier le fichier ailleurs et le restaurer.

## Les règles de données, non négociables

1. **Un champ absent reste absent.** Pas de valeur devinée, pas de référence
   fabriquée, pas d'adresse déduite d'un quartier. Une annonce sans surface
   n'a pas « 0 m² ».
2. **Un trait inconnu n'écarte jamais.** « Exclure les colocations » écarte ce
   qui EST une colocation, pas ce dont on ignore si c'en est une.
3. **Respect des sources.** `robots.txt` lu en premier et cité, 3 s entre deux
   requêtes, UA `MaiounBot/0.1 (+https://github.com/WizyxGH/Maioun)`. Aucun
   contournement d'anti-bot, de CAPTCHA, de mur de connexion ou de paywall :
   une source qui refuse est consignée dans `sources/dormant.ts`, pas forcée.
4. **Rien de personnel dans le dépôt**, qui est public. Fixtures anonymisées :
   téléphones `06 00 00 00 xx`, e-mails `@example.invalid`, aucun nom de
   personne. `pnpm check:secrets` refuse le reste ; `secret-scan-ignore` en fin
   de ligne pour ce qui est légitime, avec la raison.

## Lire la base sans risque

```bash
pnpm query "select count(*) from listings where lifecycle='active'"
```

Cet outil refuse tout ce qui n'est pas un `SELECT`, avant d'atteindre la base.
N'écrivez pas votre propre script de requête : c'est ainsi qu'un `UPDATE`
distrait finit en production.

**Les lectures sont COMPTÉES, et le quota est fini.** Le 24 septembre 2026 le
plafond mensuel de Turso a été atteint : la base a refusé toute lecture —
l'export compris —, la collecte a échoué en boucle et plus aucun diagnostic
n'était possible. Une enquête curieuse coûte des millions de lignes.

Travaillez donc sur le miroir local, qui ne coûte rien et marche hors ligne :

```bash
pnpm db:mirror                      # tire la copie, puis seulement les changements
pnpm db:mirror -- --attendre        # réessaie jusqu'à ce que le quota reparte
pnpm db:dump                        # une sauvegarde .sql portable, dans .data/
pnpm query --local "select …"       # lit la copie, jamais la base distante
```

Pour REGARDER les annonces sans la base distante, le site se branche sur une
API locale servie par le même code que le Worker :

```bash
pnpm serve:local                                # puis, dans un autre terminal
VITE_API_URL=http://localhost:8787 pnpm dev
```

`pnpm local` fait les deux à la fois : il sert ET recollecte (30 min par
défaut), dans `data/local.db`. Il interroge de VRAIS sites — ne le lancez pas
sans qu'on vous le demande.

Et pour travailler ENTIÈREMENT hors de Turso — collecte comprise —,
`MAIOUN_LOCAL=1` l'emporte sur le `.env` et vise `data/local.db`.

Le miroir est une PHOTO : chaque lecture locale affiche sa date, et un chiffre
tiré d'une copie de la veille ne vaut pas l'état du jour. Quand la fraîcheur
compte, retirez le miroir avant de conclure.

Tables utiles : `occurrences` (ce qu'une source publie), `listings` (la fiche
dédoublonnée), `listing_user_state` (favori, suivi, archivage), `source_state`,
`collection_runs`.

## Écrire du code qu'on relira

- **En français**, code comme commentaires.
- **Commentaires courts** : garder le POURQUOI, couper le récit. Le détail va
  dans le message de commit.
- **Pas de renvoi « §12 »** dans un commentaire neuf : écrire la raison en
  clair. (L'ancien code en contient encore ; ne pas en ajouter.)
- **Fabriques partagées plutôt que parseurs recopiés.** Avant d'écrire un
  parseur, chercher si la source tourne sur une plateforme déjà servie :
  `sources/hektor/` (La Boîte Immo, 56 agences), `sources/apimo/` (60),
  `sources/shared/`.
- **Tests permanents plutôt que scripts jetables.** Chaque correctif a un test
  qui échoue sans lui — le vérifier en remettant le code d'origine.

## Les pièges qui ont déjà coûté cher

- **Une fiche connue n'est relue nulle part par défaut.** Toute amélioration de
  parseur ne profite alors qu'aux annonces découvertes après elle, et une
  annonce retirée reste « en ligne ». Les fabriques Hektor et Apimo relisent
  désormais une fiche par passage ; une nouvelle source doit y penser.
- **Ce qui s'affiche doit entrer dans `occurrenceHash`**, sinon la correction
  ne descend jamais en base — et `updateDerivedFields` doit écrire la colonne,
  sinon le rejeu annonce une correction qu'il n'écrit pas.
- **Vérifier sur ce qui est COMMITTÉ.** Un commit peut référencer un fichier
  resté non suivi : reconstruire HEAD dans un arbre isolé
  (`git worktree add --detach`, `pnpm install --frozen-lockfile`) avant de
  pousser. C'est ce qui a cassé 95 collectes d'affilée.
- **Un garde-fou échoue en silence.** Après en avoir posé un sur les alertes ou
  la collecte, le vérifier sur un passage réel, pas à la relecture.
- **Une intégration continue rouge en permanence ne prévient plus de rien** :
  la remettre au vert avant d'empiler du travail dessus.

## Où vivent les choses

| Chemin                                    | Ce qu'on y trouve                                     |
| ----------------------------------------- | ----------------------------------------------------- |
| `packages/collector/src/sources/`         | une source par dossier, plus les fabriques partagées  |
| `packages/collector/src/normalization/`   | texte brut → champs typés                             |
| `packages/collector/src/deduplication/`   | rapprochement des annonces (seuil 70)                 |
| `packages/collector/src/scoring/`         | les quatre scores et « dans les critères »            |
| `packages/collector/src/notify/`          | ce qu'on ENVOIE : push, e-mail, santé des sources     |
| `packages/collector/src/inbox/`           | ce qu'on REÇOIT : lecture des réponses d'agences      |
| `packages/collector/src/server/routes.ts` | l'API, servie par le Worker                           |
| `packages/shared/`                        | ce que le site et la collecte partagent               |
| `packages/worker/`                        | Cloudflare Worker : sessions, relais de photos, crons |
| `frontend/`                               | React + Vite, publié sur GitHub Pages                 |
| `tests/`                                  | intégration, sécurité, fixtures anonymisées           |

## Décider seul, ou demander

Un correctif cerné et vérifié se committe **et se pousse** dans le même
mouvement, sans redemander. Ce qui touche la production ou l'extérieur — une
collecte, un rejeu, un déploiement, un envoi — se confirme d'abord.
