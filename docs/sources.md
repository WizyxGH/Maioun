# Les sources

**L'inventaire n'est pas ici, il est dans le code** —
`packages/collector/src/sources/`, un dossier par source, et
`frontend/src/sources.generated.ts` pour ce que le site en affiche. Une liste
de 230 sources recopiée à la main dans un fichier Markdown serait fausse la
semaine suivante.

Ce document dit ce que le code ne dit pas : **pourquoi telle source est là,
pourquoi telle autre ne l'est pas, et ce qu'il faut vérifier avant d'en ajouter
une.** Le récit daté des enquêtes est archivé dans `sources-enquetes.md`.

## Ce qu'on accepte, ce qu'on refuse

- Une API publique ou un flux officiel passe avant le HTML (§6).
- **Une source qui interdit l'accès automatisé n'est pas collectée**, quelle que
  soit sa valeur (§10). On ne contourne ni anti-bot, ni CAPTCHA, ni mur de
  connexion. `robots.txt` lu en premier, cité, et revérifié avant
  d'implémenter — il change.
- **Le volume ne décide pas.** Toute agence conforme ayant au moins une location
  dans la zone est collectée : ce sont précisément les petites qui manquent aux
  grands portails (§3).
- Les critères de classement restent couverture locale, pertinence, coût de
  collecte, simplicité, stabilité (§43).

## Les plateformes font le rendement

Quatre-vingts pour cent des agences niçoises tournent sur une poignée de
logiciels immobiliers. Ajouter une agence sur une plateforme déjà servie coûte
une vingtaine de lignes ; écrire un parseur pour une plateforme rencontrée une
seule fois en coûte deux cents.

| Fabrique                | Sources | Où                |
| ----------------------- | ------: | ----------------- |
| Apimo / Cello           |      78 | `sources/apimo/`  |
| La Boîte Immo (Hektor)  |      53 | `sources/hektor/` |
| Netty                   |       9 | `sources/netty/`  |
| Twimmo                  |       4 | `sources/twimmo/` |
| ICS                     |       2 | `sources/ics/`    |
| Outillage commun à tous |       — | `sources/shared/` |

Relevé sur le code le 2026-09-25 : 146 des 230 sources sortent d'une fabrique.

**Avant d'écrire un parseur, chercher la signature de la plateforme** dans le
HTML ou le `robots.txt` du candidat. C'est le premier réflexe, pas une
optimisation tardive.

## Les règles apprises à nos dépens

**Un sitemap et une page de liste mentent tous les deux, en sens inverse.** Le
sitemap oublie ce qui vient d'arriver ; la page de liste n'affiche qu'une
partie du stock — celle d'Étude Lotte montrait 2 fiches sur 22, toutes vivantes.
`makeApimoScraper` lit donc les deux et les additionne : on ajoute, on ne
remplace jamais. Le chemin de la page varie (`/fr/locations`, `/fr/location`,
`/fr/louer`) et **se lit sur l'accueil, il ne se devine pas** — une tentative
qui le supposait identique partout a produit 33 faux zéros.

**Un compteur qui diffère ne prouve rien.** Une comparaison de compteurs a fait
conclure à « 21 fantômes » et basculer une source sur la lecture de page :
c'était faux, et cela aurait coûté 20 annonces vivantes. Le test qui tranche est
d'interroger les fiches elles-mêmes, et il coûte deux minutes.

**Un taux de champ à zéro n'est pas forcément un bug.** Audit du 2026-09-04 sur
989 occurrences : 14 % portaient des charges. Sur les quatre familles
examinées, une seule perdait vraiment ce qu'elle affichait (Apimo, corrigé) ;
les trois autres ne publient tout simplement pas l'information — la carte FNAIM
ne porte ni charges ni DPE, les digests e-mail ne portent ni charges ni adresse,
Dinamy ne publie aucune provision. Chercher où la source se tait avant
d'accuser le parseur.

**Un correctif de parseur ne rattrape pas le passé.** Une fiche déjà connue
n'est pas relue (§30, §32) : l'amélioration ne profite qu'aux annonces
découvertes après elle. `pnpm reprocess` ne peut rien non plus quand le texte
n'a jamais été stocké. Seul un passage `--backfill` revisite les anciennes.

**Un refus se périme.** Square Habitat a été refusée sur un `robots.txt` qui
avait changé depuis, et la sonde de veille ne pouvait pas le voir. D'où
`sources/dormant.ts`.

## Ce qu'on ne collecte pas

**Les refus réversibles sont dans le code, pas ici** : `sources/dormant.ts`
porte, pour chaque candidat, le motif (`offline`, `antiBot`, `robots`,
`noVolume`), la date du relevé et la **preuve** qui dirait que la situation a
changé. Une veille lente les resonde — un candidat par jour au plus. C'est ce
qui évite les « à revoir dans quelques semaines » que personne ne revoit.

Les refus de principe, eux, ne bougeront pas :

| Source                         | Pourquoi                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Leboncoin**                  | `robots.txt` interdit la recherche et l'API, et l'écrit en toutes lettres en anglais. Fermé.                |
| **SeLoger**                    | Recherche et fiches fermées. Ses annonces nous parviennent par **alerte e-mail**, que l'utilisateur reçoit. |
| **PAP**, **Entreparticuliers** | Anti-bot dès l'accueil. Recontrôlées, plus fermées qu'avant.                                                |
| **Nexity**                     | HTTP 403 dès le `robots.txt` pour un client identifié.                                                      |
| **Guy Hoquet**, **Nestenn**    | Recherche entièrement en JavaScript, ou fiches interdites : aucun résultat dans le HTML servi.              |
| **Facebook**, **Nextdoor**     | `robots.txt` fermé, et mur de connexion.                                                                    |
| **Trovit**, **Superimmo**      | Agrégateurs : rien d'exclusif, et les annonces elles-mêmes sont interdites.                                 |
| **Lokaviz** (CROUS)            | Recherche et fiches fermées.                                                                                |

Trois familles reviennent régulièrement et sont hors sujet, non hors la loi :
la **nuitée** (HousingAnywhere, Roomlala, Cohebergement — un loyer à la nuit
n'est pas un bail), le **logement contre services** (ToitChezMoi,
Ensemble2Générations), et les **annuaires de résidences** sans annonces (Adele).
Le volume nul dans le périmètre suffit pour le reste.

## Le contact payant

`paidContact` marque les sources qui **facturent la mise en relation** —
LocService, Rentumo, Appartager, 123Loger (34 €). Ce n'est pas un jugement :
l'annonce reste consultable, et c'est pour cela qu'on la collecte. Mais
découvrir le péage après avoir ouvert la fiche est une déception qu'un mot
évite, et l'écran le dit avant le clic.

**À ne pas confondre avec « sans téléphone ni courriel ».** ParuVendu,
Studapart, MorningCroissant, ImmoJeune, LeSiteImmo et Bien'ici passent par un
formulaire ou une messagerie **gratuits**. Le relevé qui sépare les deux
familles se refait d'une requête — compter, par source, les occurrences vivantes
sans téléphone ni courriel —, mais seule la page de la source dit laquelle fait
payer.

## Ajouter une source

Dans l'ordre, et rien ne se saute :

1. **`robots.txt`**, lu et daté. S'il ferme ce qu'on voudrait lire, la source va
   dans `dormant.ts` avec sa preuve de réouverture — elle n'est pas forcée.
2. **La plateforme** : signature Apimo, Hektor, Netty, Twimmo ? Si oui, une
   vingtaine de lignes suffisent.
3. **Le volume réel**, mesuré par une requête, pas estimé.
4. **Ce que la fiche donne** : loyer, charges, surface, meublé, DPE, contact.
   C'est ce qui décide s'il faut lire la fiche en plus de la liste.
5. **Le descripteur**, avec la date de vérification dans ses `notes`.

```
Source                :
URL                   :
Type                  : portal | agencyNetwork | localAgency | aggregator
robots.txt vérifié le :
Chemins autorisés     :
Méthode               : officialApi | rssFeed | sitemap | html
Volume mesuré (Nice)  :
Champs publiés        :
Plateforme            :
```
