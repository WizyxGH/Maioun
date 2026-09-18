# Fausses annonces : ce qui est mesuré, ce qui est écarté, ce qui attend

Un seul indicateur répond à « cette annonce est-elle suspecte ? » : le score de
risque (`packages/collector/src/scoring/risk.ts`), affiché sur la fiche sous le
nom « Signaux d'alerte » au-delà de `RISK_ALERT` (`packages/shared/src/scores.ts`).
Le badge « Trop beau ? » de la carte de liste a été retiré : c'était un second
nom, avec son propre seuil, pour ce même calcul.

**La règle qui commande tout : zéro faux positif sur une accusation.** Mettre en
cause l'annonce d'une agence honnête est diffamatoire. Rien ne dit « arnaque » ;
chaque signal donne sa raison ; toute règle candidate est mesurée sur
l'inventaire réel et **retirée si elle désigne des annonceurs honnêtes**.

## Le scénario visé

Un faux particulier reprend les photos d'un logement vu ailleurs — sur Airbnb,
par exemple — et les republie en location à l'année. Retrouver ces photos sur un
site de courte durée montrerait que le bien ne lui appartient pas.

## Ce qui a été mesuré, le 2026-09-17

Inventaire : 3 210 fiches actives, 4 088 occurrences actives dont 3 868
illustrées. Lecture seule, aucune requête vers un service extérieur.

Le projet collecte déjà des plateformes de courte et moyenne durée, cousines
d'Airbnb : MorningCroissant (92 occurrences actives), Studapart (201),
ImmoJeune (37), French Riviera Studios (18), Lodgis (7) — 355 en tout. La
question se teste donc sans rien brancher.

### Photos communes entre courte durée et longue durée : aucune

Comparaison par les clés du dédoublonnage (`deduplication/similarity.ts`,
`photo-origin.ts`) : **0 paire** partageant ne serait-ce qu'une photo entre une
annonce de courte durée et une annonce d'une autre source. Y compris dans les
7 groupes qui mêlent déjà les deux mondes — ils ont été rapprochés par le texte
et les champs, pas par les clichés.

La mesure n'est pas creuse : le même calcul relie **48 paires de sources** et
des centaines de paires d'annonces ailleurs (fnaim × rentumo : 48 paires,
bienici × paruvendu : 31, bienici × roseland : 27). Il fonctionne, mais
seulement là où deux sites servent **le même fichier** — le portail qui relaie
l'export d'une agence.

**Sa limite est structurelle et il faut la connaître** : chaque plateforme
réhéberge les photos sous un nom à elle
(`morningcroissant.fr/…/crop.<empreinte>-<id>_530x365.jpg`,
`media.studapart.com/property_images_large/<empreinte>.jpeg`). La comparaison
reconnaît **le même fichier, pas la même image**. Or celui qui vole des photos
les télécharge et les rédépose : il change de fichier. C'est exactement l'angle
mort du scénario visé.

### Texte commun : 63 paires, aucune douteuse

Contrôle complémentaire, insensible au réhébergement : fragments de huit mots
partagés entre une annonce de courte durée et une annonce d'ailleurs. 63 paires,
relues une par une, et **le même annonceur des deux côtés à chaque fois** :

- une trentaine de paires MorningCroissant ↔ Bien'ici, où l'annonceur Bien'ici
  s'appelle « MORNINGCROISSANT » : la plateforme relaie son propre stock ;
- huit paires à très fort recouvrement (100 à 240 fragments) où un **bailleur
  propose le même logement en courte durée et à l'année** — même texte, et des
  loyers cohérents avec la durée (2 100 €/51 m² en meublé court contre 2 000 €
  à l'année ; 4 600 € en saisonnier pour le même bien). Un propriétaire qui
  démarche plusieurs canaux, ce qui est banal et légitime ;
- French Riviera Studios sur FNAIM et sur son propre site ; un bailleur présent
  sur Studapart et LocService ;
- le reste, trois à cinq fragments, n'est que de la prose passe-partout
  (« à deux pas de la promenade des Anglais… »).

**Aucun cas douteux. Pas un.** C'est le résultat honnête, et il valait mieux que
d'inventer un signal.

## Règles écartées, avec leur compte de faux positifs

| Règle candidate                                                      | Mesure sur l'inventaire actif                    | Verdict                                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Tarif à la nuit ou à la semaine dans une annonce mensuelle           | 16 annonces, 15 honnêtes                         | Écartée. Studapart, Dinamy, Century 21, Immo 3 Points mentionnent leur offre saisonnière                                          |
| Vocabulaire de séjour (« check-in », « taxe de séjour », « ménage ») | 24 annonces, dont 21 du texte standard Studapart | Écartée                                                                                                                           |
| « Location saisonnière » ou « courte durée » annoncée                | 23 annonces, presque toutes des agences          | Écartée — une agence qui loue aussi en saisonnier le dit, et c'est légal                                                          |
| Deux noms d'annonceur différents pour un même bien                   | **115 groupes, 115 honnêtes**                    | Écartée. Citya Dalbera/Dalberra, BEP Nice/Antibes, Orpi GTI, Boulevard Gestion/Cimiez Boulevard : une enseigne, plusieurs agences |

Le dernier cas mérite d'être retenu : 115 faux positifs, exactement le compte du
motif « adresse gmail » écarté avant lui. Un réseau d'agences porte plusieurs
noms pour un même bien, et cela ne dit rien d'autre.

## Pourquoi zéro, et ce qui changerait la réponse

**L'arnaque vit là où les particuliers déposent librement et sans contrôle** :
Leboncoin, les groupes Facebook, Marketplace. **Aucun de ces canaux n'est
collecté** — les portails que nous lisons intermédient, vérifient ou facturent
le dépôt. Zéro vrai positif sur 3 210 annonces n'est donc pas la preuve que la
détection marche : c'est la conséquence du périmètre.

Le jour où une telle source entrerait, dans cet ordre :

1. **Comparer les photos dans notre propre base** — gratuit, déjà outillé
   (`photoKeys`, `photoOrigin`, `photoName`), et le corpus de courte durée est
   déjà là. À faire d'abord, et à étendre : pour survivre au réhébergement il
   faut une empreinte du **contenu** de l'image (empreinte perceptuelle calculée
   chez nous), pas de son nom de fichier. Le croisement doit se faire avec la
   nature de l'annonceur : une agence qui loue le même bien en saisonnier et à
   l'année est légitime ; un « particulier » qui republie les photos d'une
   annonce de courte durée l'est beaucoup moins.
2. **Alors seulement**, la recherche d'image inversée payante. Décision de
   l'utilisateur, aujourd'hui **non** : TinEye a une API légitime mais coûte des
   centaines d'euros par mois et enverrait nos photos dehors. La recherche
   inversée de Google est fermée (pas d'API, conditions et `robots.txt`
   contraires) et n'est pas contournée.

Tant qu'aucune source de dépôt libre n'est collectée, ces deux étapes
n'achèteraient rien : il n'y a rien à trouver.
