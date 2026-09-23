# Étude des sources — Nice

Ce document est l'inventaire prévu au §43 du cahier des charges : avant de coder
des scrapers, identifier les sources réellement pertinentes pour Nice et les
classer. Il est le **préalable obligatoire** à tout nouveau scraper — on n'ajoute
pas une source qui n'a pas sa fiche ici.

Les observations `robots.txt` datées ci-dessous ont été faites le **2026-08-14**.
Un `robots.txt` peut changer à tout moment : **revérifier avant d'implémenter**,
et noter la date de vérification dans le descripteur de la source
(`SourceDescriptor.notes`).

## Principes de sélection (rappel)

- Une API publique ou un flux officiel est toujours préféré au HTML (§6).
- Une source qui interdit l'accès automatisé n'est **pas** collectée — on
  n'implémente pas de contournement, quelle que soit sa valeur (§10).
- Le classement privilégie : couverture locale / pertinence / coût de collecte /
  simplicité / stabilité (§43).
- Les agences locales sont une priorité stratégique : leurs annonces sont
  parfois absentes des grands portails (§3).

## État des vérifications

### Réseaux d'agences

| Source                                              | robots.txt vérifié | Verdict                       | Détail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Laforêt** (laforet.com)                           | 2026-08-14         | ✅ **Implémentée**            | Seul `/louer/rechercher?*` est interdit ; les pages `/ville/location-appartement-{ville}-{cp}` et leur pagination sont autorisées. Le site déclare de plus `Allow: /` pour les agents d'IA identifiés (GPTBot, PerplexityBot, AnthropicBot…), signe d'une politique ouverte à l'accès automatisé identifié. Pages SSR facilement parsables, ~30-40 annonces par page couvrant Nice **et** les communes voisines (Cagnes, Beausoleil, Cannes). Excellent rapport information/requête.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Orpi** (orpi.com)                                 | 2026-09-16         | ✅ **Implémentée**            | `/recherche/*` et les URLs à paramètres (`agency=`, `contact=`, `orderBy=`…) sont interdits ; les pages ville `/location-immobiliere-{commune}/` et leur pagination `?page=N` ne le sont pas. **TREIZE COMMUNES** du périmètre, une page chacune (Nice en occupe quatre, 15 annonces par page) : 71 logements annoncés le 2026-09-16 contre 50 pour la seule recherche niçoise. Le site **publie son total** par type de bien (`nbResults` dans le `data-eulerian-action` des liens de filtre) : c'est lui qui dit si l'inventaire a été lu en entier. Au-delà de sa dernière page, comme pour une commune inconnue, Orpi répond 200 et sert la page du **département** — reconnue à son lien canonique, et ignorée. Un carrousel « communes à proximité » répète six annonces d'autres communes sur chaque page : seules les cartes du conteneur de résultats sont lues. Cartes riches : prix, surface, pièces, agence, quartier et **coordonnées GPS** (attribut de tracking `data-eulerian-action`, traité comme enrichissement fragile — le HTML visible fait foi ; ses champs `meuble` et `dateCreation` se contredisent et sont écartés). Chambres, étage, dépôt, charges, honoraires, DPE, date de mise en ligne, photos et contact de l'agence ne sont que sur la **fiche** (JSON `data-estate`). |
| **Century 21** (century21.fr)                       | 2026-08-15         | ✅ **Implémentée**            | Verdict initial « écartée » CORRIGÉ après relecture : seules les recherches par code postal (`cp-…`) et par agence sont interdites — le format par ville `/annonces/location-appartement/v-nice/` ne l'est pas, s'affiche en SSR (`meta robots: index`) et couvre tout le stock en une requête. Première collecte réelle le 2026-08-15 : 19 annonces, 1 requête, 0 warning.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **ERA Immobilier** (eraimmobilier.com)              | 2026-09-04         | ✅ **Implémentée**            | Demandée sous le nom de sa franchise niçoise « ERA Mac Immobilier » ; on prend le réseau, dont la page ville rassemble les six agences ERA présentes sur Nice pour le même nombre de requêtes. `robots.txt` interdit `/louer`, `/acheter`, `/estimer` et les URLs à paramètres (`agence_id=`, `display=`…) ; `/location/…` et `/annonces/<id>` sont autorisés, et la page ville figure dans `sitemap_silo_location.xml`. Angular **SSR** : la page embarque son état de transfert (`<script id="ng-state">`), qui porte les annonces structurées — descriptif ENTIER (le HTML visible le tronque), toutes les photos, la franchise et son téléphone en clair. Cet état nomme l'API interne `api.eraimmobilier.com`, dont le `robots.txt` est `Disallow: /` : elle n'est **jamais** appelée (§10). ⚠️ La géolocalisation fournie est celle de l'agence ou le centroïde de la ville, jamais celle du bien — trois annonces sur dix partageaient le même point, une pointait sur Cannes : elle est ignorée (§17, §20). Relevé du 2026-09-04 : 12 locations à Nice, 2 requêtes.                                                                                                                                                                                                                               |
| **Guy Hoquet** (guy-hoquet.com)                     | 2026-08-15         | 🟠 Candidate — travail requis | robots.txt n'interdit que des endpoints techniques (le bot générique passe). MAIS les annonces sont éparpillées sur 18+ sous-sitemaps « requêtes-métiers » (Nice absent du principal, 45 000 URLs) et la page `/biens/result` semble exiger des paramètres. Implémentable mais demande de localiser l'URL SEO Nice et de vérifier qu'elle n'est pas sous paramètres restreints. Reporté.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Foncia** (fr.foncia.com)                          | 2026-08-15         | ✅ **Implémentée**            | Disallow ciblés (URLs à paramètres `/*?` sauf `?datemaj`) ; les pages `/location/{ville}/{type}` ne sont pas interdites. Angular **SSR** : ancrage sur les classes `foncia-card-*` (jamais les attributs générés `_ngcontent-*`). Une page ≈ tout Nice en une requête, **avec l'adresse complète du bien dans le titre** — signal de dédoublonnage très fort (§14). Pagination à paramètres interdite → non utilisée. Première collecte réelle le 2026-08-15 : 15 annonces, 1 requête, 0 warning. Depuis le 2026-09-04, les annonces disparues de la liste voient leur fiche vérifiée (5 par run) : Foncia y remplace le bien par « Cette annonce n'est plus disponible » — plus de loyer, plus de dépôt de candidature — et bascule son `status` d'`active` à `deleted` dans l'état de transfert. Le doute du cycle de vie est donc levé sans supposition (§32).                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Nexity** (nexity.fr)                              | 2026-08-15         | 🔴 Écartée                    | HTTP 403 dès `robots.txt` pour un client HTTP identifié : hostile aux non-navigateurs (§10).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Lamy** (lamy-immobilier.fr)                       | 2026-08-17         | ✅ **Implémentée**            | Demandée explicitement (« Lammy »). robots.txt permissif (seuls `/is_admin/` et `/login/` interdits), sitemap déclaré. CMS Ibexa, fiches server-rendered ancrées sur les classes `estate__*` (titre, prix « par mois / CC », référence, description, caractéristiques, échelle DPE/GES avec lettre active). Sitemap urlset unique (~1,9 Mo, ~3 200 locations France) : méthode sitemap, seules les fiches nouvelles des communes cibles (06) sont visitées. Première collecte réelle le 2026-08-17 : 8 annonces (Nice, Drap), 9 requêtes, 0 warning.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Citya** (citya.com)                               | 2026-08-19         | ✅ **Implémentée**            | Réseau national d'administration de biens, demandé explicitement. robots.txt : `/annonces/*` autorisé ; `/recherche`, `/api`, `/carte` et les URLs à PARAMÈTRES (prixMin, ville, meuble…) interdits → on n'utilise que les pages SEO par commune `/annonces/location/{type}/nice-06088` (INSEE), en SSR. Fiche : JSON-LD `RealEstateListing` (prix, nom type/pièces/surface/ville, description) ; CP réel repris de la description. Seules les fiches résidentielles nouvelles sont visitées. Première collecte réelle le 2026-08-19 : 8 annonces Nice, 10 requêtes, 0 warning.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Mirabello Immobilier** (mirabello-immobilier.com) | 2026-08-21         | ✅ **Implémentée**            | Agence niçoise (11 bis rue du Congrès), demandée explicitement. Backend Apimo mais frontend Symfony maison (« Design by Apimo ») → structure HTML différente du template Cello : on parse le **JSON-LD schema.org** de chaque fiche `/fr/propriété/{id}` (nœud `Apartment`/`House` : réf, prix, surface, pièces, **adresse de rue exacte**, géoloc, photos, date). robots.txt n'interdit que `/app_dev.php`. Prix retenu = loyer **charges comprises** (span `.price` = `offers.price` hors charges + provision). Pas de détection « loué » : le seul signal (`availability=OutOfStock`) couvre aussi les baux à disponibilité future (bail étudiant) → ambigu, laissé au cycle de vie. Publie aussi Cagnes-sur-Mer → filtré par commune. Liste unique `/fr/locations` (~7 biens).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **In'li** (inli.fr)                                 | 2026-08-21         | ✅ **Implémentée**            | Bailleur institutionnel de **logement intermédiaire** (Action Logement) : loyers à prix maîtrisé, sous conditions (salariés secteur privé, plafonds de ressources — éligibilité vérifiée par l'utilisateur). Demandée explicitement. robots.txt permissif (seul `/espace-membre/`). Catalogue paginé national `/locations/offres/?page=N` (~22 pages) **sans filtre serveur par ville** (localisation via autocomplétion JS non reproductible en HTTP) → on pagine et on ne retient que Nice, on ne visite que les fiches nouvelles ; pages liste en cache conditionnel (§30, §32). Fiche SSR sans JSON-LD : `og:title` (surface), `og:description` (loyer CC), corps (pièces, charges, photos) ; pas d'adresse de rue. Collecte réelle le 2026-08-21 : 3 annonces Nice (656/470/2 180 € CC), 22 pages, 0 warning.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **L'Adresse** (ladresse.com)                        | 2026-08-22         | ✅ **Implémentée**            | Réseau coopératif d'agences, agence Nice, demandée explicitement. robots.txt permissif (2026-08-22). Page de résultats SSR `/recherche/location/appartement/nice-06000` : chaque carte `a.bien` porte tout — prix **CC**, type, pièces, surface, ville/CP (dans l'`alt` de la photo), photo, lien `/annonce/location/…/{id}`. **Une requête, pas de visite de fiche** (§30) ; pas de JSON-LD. Communes voisines (Cannes, Le Cannet…) écartées au scoring. Collecte réelle le 2026-08-22 : 15 annonces (11 Nice), 1 requête, 0 warning.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Square Habitat** (squarehabitat.fr)               | 2026-09-08         | 🔴 **Écartée (robots.txt)**   | Réseau Crédit Agricole. **Verdict « travail lourd » du 2026-08-22 CORRIGÉ** : il disait « robots.txt permissif », ce qui était faux. Relecture du 2026-09-08 : `Disallow: /resultat-location`, `/sh-*/louer-appartement-*.aspx`, `/sh-*/louer-maison-*.aspx` et `/-/*` — les pages de résultats location sont nommément interdites. L'obstacle n'était donc pas l'Angular SPA ni l'API interne (`api.ca-immobilier.fr`, chunks lazy, captcha Kameleoon) : savoir rendre le JavaScript ne change rien ici, le site dit non. Écartée sans réserve (§10).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Stéphane Plaza** (stephaneplazaimmobilier.com)    | 2026-08-22         | 🟠 Candidate — travail requis | robots.txt permissif (`Allow: /`). Mais site **JS-driven** : `/louer/` est une landing (18 Ko) sans loyers ni liens de fiche SSR ; la recherche est cliente. Aucune page de résultats Nice en SSR trouvée → il faut localiser l'API/le rendu des annonces. Reporté.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Nestenn** (nestenn.com)                           | 2026-08-22         | 🔴 Écartée                    | robots.txt **interdit les fiches** : `Disallow: /listing*` et `/?action=listing*`. Les annonces sont hors d'accès automatisé conforme (§10). Écartée sauf découverte d'une surface autorisée.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **AFEDIM** (afedim.fr)                              | 2026-09-14         | ✅ **Implémentée**            | Crédit Mutuel Alliance Fédérale ; locations gérées par AFEDIM Gestion, demandée explicitement. Presque tout le stock est du **Pinel sous plafond de ressources**. robots.txt : `User-agent: *` → `Allow: /` ; seuls les robots d'IA nommés se voient fermer `_stack=` et les pages `demande-informations`, `demande-visites-locations`, `depot-dossier-location`. Pas d'anti-bot sur liste et fiches (WAF Euro-Information, aucun défi). La liste d'un département porte TOUT son stock en JSON embarqué (`allProduits`) : **une requête** pour l'inventaire, puis la fiche de chaque bien ciblé (JSON `DonneesBien` : adresse, loyer HC/CC, provision sur charges, dépôt, honoraires, DPE, photos, disponibilité, et `ArretDepotDossier` = candidatures suspendues). Volume **minuscule** : 5 biens dans le 06 le 2026-09-14, dont 3 dans les communes cibles (Nice ×2, La Trinité), 4 sur 5 à candidatures suspendues. Candidature en ligne derrière compte + CAPTCHA image : pas d'automatisation.                                                                                                                                                                                                                                                                                                     |

#### Balayage des réseaux non collectés (2026-09-09)

Huit réseaux étaient déjà collectés — Century 21, Citya, ERA, Foncia, Laforêt,
Lamy, Lodgis, Orpi. Voici ce que valent les autres, vérifié le même jour.

| Réseau                                                 | robots.txt                | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Arthurimmo** (groupenicetransactions.arthurimmo.com) | permissif                 | ✅ **Implémentée le 2026-09-09** — 7 locations niçoises, servies en SSR avec loyer, surface et pièces. `User-agent: *` n'interdit rien ; le fichier bloque nommément `Claudebot`, `Bytespider` et `barkrowler`, c'est-à-dire des robots d'entraînement d'IA — pas un agent de recherche personnel qui s'annonce. Volume comparable à ERA (7) ou Lodgis (7). **Deux étapes, imposées par le site** : la page de résultats est du Tailwind engendré, sans classe stable, mais elle expose l'ADRESSE CANONIQUE de chaque fiche (`/annonces/location/appartement/nice-06000/33699516.htm`), qui dit déjà la transaction, le type et la commune. Tout le reste vient du TITRE SOCIAL de la fiche, composé par le site dans un ordre invariable — « Louer appartement de 5 pièces 128 m² 2 950 € à Nice (06000) » — donc bien plus sûr que le titre visible, qui est libre. Seules les fiches nouvelles sont visitées : huit requêtes pour l'inventaire entier, deux en régime établi. |
| **Guy Hoquet** (guy-hoquet.com)                        | 40 règles                 | 🔴 Recherche entièrement en JavaScript : `/annonces/location/nice-06000` rend 14 Ko de formulaire et zéro résultat.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Nestenn** (nestenn.com)                              | 6 règles                  | 🔴 Même chose : la page de recherche ne porte aucun résultat, seulement des filtres.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Immo de France** (immodefrance.fr)                   | aucune règle              | ⚪ Redirige vers `procivis.fr` — l'enseigne a changé de main. À reprendre sous ce nom si le besoin s'en fait sentir.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Sergic** (sergic.com)                                | 5 règles                  | ⚪ Pas de page de location niçoise trouvée (404 sur les chemins usuels).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Nexity** (nexity.fr)                                 | **403 sur le robots.txt** | 🔴 Protection agressive dès la périphérie, comme AvendreALouer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Human Immobilier** (humanimmobilier.fr)              | 404                       | ⚪ Réseau du Sud-Ouest, sans implantation niçoise apparente.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**CE QUE CE BALAYAGE APPREND, au-delà du cas par cas :** les grands réseaux
nationaux passent en recherche cliente. Guy Hoquet, Nestenn, Stéphane Plaza et
Square Habitat rendent tous une page de filtres sans résultat. Les enseignes
qui restent lisibles sont celles dont le site tourne encore sur un gabarit
d'éditeur immobilier — Arthurimmo, Century 21, Orpi, Laforêt. C'est un fonds
qui se réduira, et l'import par alerte e-mail garde donc sa raison d'être.

#### Autres pistes examinées le 2026-09-09

| Piste                                        | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Trovit** (trovit.fr)                       | 🔴 Écartée. `robots.txt` interdit `/listing/`, `/details/` et `/rss/` — c'est-à-dire les annonces elles-mêmes. S'ajoute la raison de fond déjà retenue pour MoteurImmo : un agrégateur ne produit que des données de seconde main.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Immobilière Pujol** (immobiliere-pujol.fr) | ✅ **Implémentée le 2026-09-09** — verdict « écartée » RETOURNÉ. `robots.txt` permissif et plan de site de 4 681 annonces, mais **18 seulement concernent Nice** — l'agence est marseillaise — et celles-ci sont **clôturées** (« Ce bien a été loué »). Aucune location niçoise en cours. À noter tout de même : ces archives portent l'adresse EXACTE et le loyer obtenu, ce qui en ferait une référence de prix, usage différent de la collecte d'annonces.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **ParuVendu** (paruvendu.fr)                 | ✅ **Implémentée le 2026-09-11, élargie le 2026-09-16.** 160 appartements à Nice, 42 dans les douze communes voisines et 8 maisons du périmètre. Les deux tiers viennent d'agences déjà collectées (BEP 32, Citya 23, LocService 13, L'Adresse 13, Century 21 11), le reste est l'apport : **des particuliers** et une douzaine d'agences qu'aucune autre source ne lit (Riviera Boulevard, MCE, A Alliance, BSK, 123loger, Bérénice…). `robots.txt` : ferme `/immobilier/annonceimmofo/`, `/immobilier/annoncefo/`, `/communfo/popincommunfo/` et `?pagv=`, `?tri=`, `?d=`, `?fulltext=` ; la pagination `?p=N`, les bornes `?px0=`/`?px1=` et les fiches restent ouvertes. **CINQ PAGES DE TRENTE PAR RECHERCHE, pas une de plus** : l'inventaire niçois se lit par BANDES DE LOYER, dont la somme des totaux doit retrouver le total annoncé (4+23+55+40+38 = 160) ; les tranches `?nbpieces=` ne servent plus, le portail ne les propose que de 1 à 4 et sept annonces restaient hors de toute tranche. Deux replis silencieux : le portail sert sa recherche DÉPARTEMENTALE (200, 387 annonces) pour une commune sans annonce, et sa recherche « maisons à Nice » verse toute la région pour trois maisons niçoises — le titre de la page et la commune de chaque carte sont les seuls garde-fous. La carte donne loyer CC, surface, pièces, chambres, DPE, photos en 320 px et le pseudonyme du déposant ; la fiche ajoute code postal, charges, dépôt, honoraires, étage, ascenseur, référence de l'annonceur et photos en 1 000 px. **Ni téléphone ni courriel nulle part** : le contact passe par une fenêtre que le `robots.txt` ferme. Des particuliers y déposent aussi leur RECHERCHE de logement, sans que le site les sépare des offres : écartées au texte, voir plus bas. |
| **ImmoJeune** (immojeune.com)                | 🟡 À faire si la recherche s'ouvre aux étudiants. `robots.txt` permissif, **621 annonces** à Nice — mais la recherche actuelle EXCLUT les locations étudiantes, qui en font l'essentiel. Relevé le 2026-09-11.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Location-etudiant.fr**                     | ⚪ Même famille que LocService ; la page Nice est un guide, sans annonces. Relevé le 2026-09-11.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Lokaviz** (CROUS)                          | 🔴 Écartée : son `robots.txt` interdit précisément la recherche (`/rechercher-un-logement/…`) et les fiches. Relevé le 2026-09-11.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Ibox Immobilier** (agenceibox.com)         | 🔴 Écartée le 2026-09-10 — hors zone. Agence TOULONNAISE : sur les 68 locations d'habitation de son plan de site, **toutes sont dans le Var** (Toulon 37, La Seyne-sur-Mer 9, Saint-Mandrier 4…), **aucune dans les Alpes-Maritimes**. Le seul bien niçois est une maison à vendre. Techniquement ouverte (`robots.txt` « Allow: / », plan de site, JSON-LD) : à reprendre en une heure si la recherche s'étend un jour au Var. **Revérifiée le 2026-09-17, verdict inchangé** : le catalogue est passé à 85 locations annoncées, que le plan de site retrouve exactement (71 logements + 14 parkings), et la répartition reste entièrement varoise (Toulon 43, La Seyne-sur-Mer 8, Saint-Mandrier 3…) ; le seul « nice » du plan de site est toujours la même maison à vendre. La plateforme est **La Boîte Immo**, celle que couvre l'adaptateur générique `hektor` — l'ajout coûterait un descripteur, mais apporterait zéro annonce du périmètre, et la base n'en contient aucune trace (0 occurrence). Le second domaine du groupe, `ibox-gestion-location.fr`, est la même enseigne varoise (`robots.txt` sans interdiction, aucune mention des Alpes-Maritimes).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Réseau Expert Immo**                       | ⚪ Introuvable sous ce nom. `expertimmo.com` est un domaine parqué à vendre ; aucune enseigne niçoise ne correspond. Si vous avez l'adresse exacte, je reprends.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### Portails

| Source                                         | robots.txt vérifié | Verdict                                        | Détail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PAP** (pap.fr)                               | 2026-08-15         | 🟠 **Implémentée mais DÉSACTIVÉE**             | robots.txt : `/*?*` et `/recherche/*` interdits, mais les pages `/annonce/locations-{ville}-g{id}` sont autorisées ET déclarées dans le sitemap `liste_annonces.xml`. Scraper complet écrit et testé (cartes riches : prix, pièces, chambres, surface, DPE, description). **MAIS** en collecte réelle, le WAF répond 403 aux clients HTTP non-navigateurs, même honnêtement identifiés (vérifié : curl 200 / fetch Node 403, même UA et même IP → filtrage d'empreinte client). Imiter un navigateur serait un contournement (§10) → `enabled: false`. Réévaluer périodiquement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **FNAIM** (fnaim.fr)                           | 2026-09-04         | ✅ **Implémentée**                             | Portail de la fédération professionnelle, pas un agrégateur commercial : **193 agences niçoises** y publient elles-mêmes, et beaucoup n'ont pas de site scrapable. C'est la source qui répond le mieux à « réduire la dépendance aux alertes e-mail ». `robots.txt` n'interdit que `/include/`, `/cms/`, l'espace adhérent et quelques paramètres d'affichage. Pages SSR, 25 annonces/page, pagination SEO `…-nice-06000-page-N.htm` **sans querystring** (celle du gabarit en porte une : on ne l'utilise pas). La recherche `06000` remonte aussi les 06100/06200/06300 — une URL couvre Nice. Résultats **triés par loyer croissant**. Le verdict initial en déduisait que « trois pages suffisent à couvrir la tranche recherchée » — vrai tant que l’inventaire ne servait qu’à un budget, faux depuis que consulter est libre : une source triée par prix et coupée au tiers ne montre pas les moins chers, elle cache tout le reste. **Dénombrement du 2026-09-16, page par page : Nice en appartement fait 173 annonces sur sept pages, et nous les avions toutes — la pagination n'était plus le trou.** Le trou était ailleurs : on ne demandait au portail QU'UNE recherche. Les **maisons** (6 à Nice) et les **douze autres communes suivies** (Cagnes 13, Saint-Laurent-du-Var 8, Villefranche 4, Villeneuve-Loubet 2, Cap-d'Ail 2, Carros 2, Beaulieu 1, La Trinité 1, Colomars 1) n'étaient pas cherchées : **48 annonces absentes sur 221, soit 22 % du stock du périmètre**. Une recherche par commune plus une recherche des maisons à l'échelle du département : **21 pages par passage au lieu de 8**. La recherche départementale des APPARTEMENTS, elle, est écartée — elle est tronquée (225 annonces pour tout le 06, dont 67 niçoises manquantes). Deux pièges relevés : le portail **abrège les communes** (`st-laurent-du-var`, `st-andre`) et répond **200 avec sa page d'accueil** à un slug qu'il ne connaît pas — huit annonces perdues sans le moindre signe ; et le lien « Page suivante » est le seul marqueur de fin, compter les `-page-N` faisait demander une page vide de plus à chaque passage. Cartes très riches : titre canonique en `data-title`, loyer, description avec retours à la ligne **contenant souvent l'adresse en toutes lettres**, équipements, nom de l'agence et **son téléphone en clair**. Pas de `relaysListings` : les photos sont réhébergées et les adhérents sont les réseaux déjà collectés en direct, dont certains illustrent des dizaines d'annonces avec la même photo (§14).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Leboncoin** (leboncoin.fr)                   | 2026-08-14         | 🔴 Écartée pour le MVP                         | `/recherche` et `/api/*` sont interdits ; les pages d'annonces individuelles (`/*/*.html`) sont autorisées mais **inaccessibles sans passer par la recherche**. Protection anti-bot (DataDome) documentée publiquement. Pas de méthode d'accès conforme identifiée à ce jour ; ne pas contourner (§10). Réévaluer si un flux officiel apparaît.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **SeLoger** (seloger.com)                      | 2026-09-16         | 🔴 Écartée en direct — reçue par alerte e-mail | Verdict du 2026-08-14 CONFIRMÉ et complété. **Ce qui est ouvert :** `robots.txt` seul (HTTP 200). Il n'interdit PAS `/annonce/…` — la fiche d'une annonce est donc autorisée sur le papier. **Ce qui est fermé :** tout le reste, et pas par une règle mais par un videur. `/annonce/<ref>`, `/sitemap.xml` et `/sitemap_index.xml` répondent tous **HTTP 403** à un client honnêtement identifié (`MaiounBot/0.1`), avec la page `var dd={…}` de **DataDome**. Aucun `Sitemap:` n'est déclaré dans `robots.txt`, et les deux emplacements conventionnels sont derrière le même 403 : il n'y a donc pas de plan de site à lire. Passer ce mur demanderait d'imiter un navigateur, ce que le projet s'interdit (§10) — l'autorisation de `robots.txt` ne vaut rien quand le serveur refuse la requête. **Pas d'API partenaire publique** : celles du groupe AVIV s'adressent aux annonceurs sous contrat, pas aux lecteurs. **LA VOIE OUVERTE EST L'ALERTE E-MAIL**, et elle porte : 338 occurrences `email-alerts:seloger:*` en base au 2026-09-16, dont **178 qu'aucune autre source ne rend** — c'est la plus grosse contribution exclusive du projet après les agences elles-mêmes. Voir « Ce que les digests SeLoger rendent » plus bas pour ce qu'on en tire et ce qui manque.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Logic-Immo** (logic-immo.com)                | 2026-08-14         | 🟠 Prudence                                    | Même groupe que SeLoger. `*/classified-search?*` interdit mais sitemap `sitemap_index.xml` déclaré. À étudier via sitemap uniquement ; faible priorité car recoupe SeLoger.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Bien'ici** (bienici.com)                     | 2026-09-08         | ✅ **Implémentée** (API)                       | **Verdict « écartée (SPA) » du 2026-08-15 LEVÉ.** Il disait vrai — `/recherche/…` sert 5 Ko sans une seule annonce — et concluait « réévaluer si un flux apparaît ». Le flux était là : la page appelle `GET /realEstateAds.json?filters=<JSON>`, la même adresse que le navigateur, et elle rend du JSON. `robots.txt` relu le 2026-09-08 : il interdit les chemins de contact, `/*?mode=*`, `/recherche/*&*`, `/recherche/*,*`, `/annonces-*` et tout ce qui porte `tri=` ; ni ce chemin ni nos paramètres n'y figurent (§10) — même lecture que pour l'API Studapart. Zone Nice `-170100` via `suggest.json?q=nice`, `size=100` honoré : **512 locations en six requêtes**. Fiche d'une richesse sans équivalent dans le projet : surface, pièces, chambres, **meublé**, **DPE**, **quartier nommé**, dépôt de garantie, honoraires, date de parution, nom de l'agence. **PRIX CHARGES COMPRISES** — établi par l'arithmétique et non supposé : « Loyer hors charges: 785€ » pour `price: 900, charges: 115` ; le champ `charges` dit la part incluse, il ne s'ajoute pas. **POSITION SOUS CONDITION** : `blurInfo` DÉCLARE la précision (`exact`, ou un disque de 50/100/1 000 m). On ne publie de coordonnées qu'au-delà de `exact` ou d'un rayon ≤ 100 m ; à 1 000 m le site ne situe que la commune, et publier ce point rendrait faux le temps de trajet (§20) et hasardeux le rapprochement « même endroit » (§14). Relevé : 13 exactes, 72 disques, 15 communes sur 100. **PHOTOS À LEUR ORIGINE** : chaque cliché arrive en double (le logiciel de l'agence — `img.netty.immo`, `apimo` — et la copie Bien'ici) ; on garde l'original, vraie provenance (§11) et surtout URL que publie AUSSI le site de l'agence que nous collectons en direct — signal de doublon très fort (§14). `relaysListings: true`. Apporte enfin le signal **particulier / professionnel** (`accountType`), que le projet n'avait jamais su établir : sur 1 100 fiches, zéro particulier détecté, faute de description à fouiller. **RETRAIT DÉCLARÉ** (relevé du 2026-09-16) : `/annonce/…` sert la MÊME coquille de 15 Ko qu'une annonce soit en ligne ou retirée — « cette annonce n'est plus disponible » vit dans le script de l'application, sur toutes les pages, et y chercher un marqueur retirerait tout le stock. La fiche JSON, elle, le dit : `status.onTheMarket: false` (avec `closingDate`). Les annonces que la liste portait au passage précédent et ne porte plus sont donc vérifiées une à une, et remontent en `withdrawnRefs`. **CODE POSTAL DU QUARTIER** : `postalCode` vaut souvent celui du bureau central de la commune (06000 pour une annonce de Caucade, qui est en 06200) là où le polygone du quartier porte le sien — 75 annonces sur 533 le 2026-09-16 ; le quartier se prend sur `district.libelle` (« Caucade »), et le polygone de la COMMUNE (58 annonces) n'en est pas un. **`flatSharing` NON REPRIS** : le champ existe et signale 45 annonces sur 533, mais il est déduit du texte à l'import — il coche un T3 dont la description dit seulement « parfaites pour accueillir une petite famille ou des colocataires ». Les règles de texte du projet couvrent tout ce qu'il a de juste. |
| **Figaro Immobilier** (immobilier.lefigaro.fr) | 2026-09-15         | ✅ **Implémentée**                             | Accessible depuis le relevé d'août (refus levé). robots.txt : `/annonce/` (fiches) et `/rest/` interdits, `/annonces/…?page=N` autorisé. Liste seule : ~365 annonces à Nice (appartements, chambres, maisons) lues dans les données Nuxt de la page, description entière comprise ; les relais LocService sont repérés. Passage incomplet (moins que le total annoncé) : rien n'est retiré.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **AvendreALouer**                              | 2026-08-14         | 🟠 Prudence                                    | 403 sur `robots.txt` lui-même : protection agressive en périphérie. Reporter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **MoteurImmo** (moteurimmo.fr)                 | 2026-08-14         | 🟠 Cas particulier                             | `robots.txt` totalement permissif (`Disallow:` vide). MAIS c'est un agrégateur : collecter un agrégateur produit des données de seconde main (URLs indirectes, fraîcheur dégradée, CGU propres). Utile éventuellement pour la _découverte_ d'agences locales, pas comme source primaire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### Agences locales

| Source                              | robots.txt vérifié | Verdict            | Détail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | ------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BEP Logement** (bep-logement.com) | 2026-08-15         | ✅ **Implémentée** | Agence Antibes/Nice (plateforme Cello/Apimo), demandée explicitement. robots.txt permissif (seul `/app_dev.php` interdit) + sitemap déclaré : collecte par **sitemap** (2 requêtes découvrent ~780 fiches avec `lastmod` ; seules les fiches nouvelles des communes cibles sont visitées, ~8/run max ; les connues sont confirmées via le sitemap sans requête). Fiches avec JSON-LD schema.org complet : téléphone + e-mail d'agence, date de publication, surface, pièces. Communes cibles : Nice et continuité urbaine (liste dans le descripteur). Première source de méthode `sitemap` — valide le second mode de collecte du core. |

| **Saint Roch Immobilier** (saintrochimmobilier.com) | 2026-08-18 | ✅ **Implémentée** | Agence niçoise (quartier Saint-Roch), site ASP maison SSR, demandée explicitement. robots.txt n'interdit que l'admin et les endpoints de formulaires (`/moteur_recherche.asp` non utilisé) ; liste `/location-immobilier-nice.asp` + fiches `/annonce/…asp` libres. Fiches riches : loyer CC + provision de charges, **DPE/GES en toutes lettres** (`colorDPE{X}`), photos, téléphone. Publie aussi St-Dié-des-Vosges (réseau familial) → filtré par commune. Première collecte réelle le 2026-08-18 : 3 annonces Nice, 4 requêtes, 0 warning. |

### Autres agences locales de Nice

Inventaire Apimo du **2026-08-17** (découverte via les pages `agence-apimo-{id}`
de Bien'ici, qui listent les agences alimentées par la plateforme — méthode
réutilisable). Signature vérifiée individuellement le même jour (robots.txt
n'interdisant que `/app_dev.php`, sitemap déclaré, fiches
`/fr/propriete/location+…`) :

| Source                                               | Vérifié    | Verdict            | Détail                                                                                                                             |
| ---------------------------------------------------- | ---------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Agence de la Victoire** (agence-victoire-nice.com) | 2026-08-17 | ✅ **Implémentée** | ~25 locations à Nice. Première collecte : 8 fiches, 0 warning.                                                                     |
| **Foch Immobilier** (groupe-foch.com)                | 2026-08-17 | ✅ **Implémentée** | Nice port, gestion locative depuis 1989. ~25 locations Nice + Cagnes.                                                              |
| **Personal Immo** (personalimmo.fr)                  | 2026-08-17 | ✅ **Implémentée** | ~16 locations à Nice. Sitemap contenant des fiches retirées (301 → not-found) : le parser Apimo ignore désormais les fiches vides. |
| **leprince realty** (leprincerealty.com)             | 2026-08-17 | ✅ **Implémentée** | ~6 locations Nice + Beaulieu-sur-Mer.                                                                                              |

Second passage du **2026-09-04**, mené avec `scripts/probe-agency.mjs` (robots.txt
d'abord, annonces publiques ensuite, volume enfin) :

| Source                                       | Vérifié    | Verdict            | Détail                                                                                                                                                                                                                                              |
| -------------------------------------------- | ---------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Palais Immobilier** (palaisimmobilier.com) | 2026-09-04 | ✅ **Implémentée** | **105 locations** dans les communes cibles — la plus grosse source locale du projet (fnaim.fr, portail, en rend 221 depuis le 2026-09-16). Réseau à plusieurs bureaux (Vieux Nice, Nice Ouest). Budget de découverte porté à 40 fiches par passage. |
| **AKOR Immo** (akorimmo.com)                 | 2026-09-04 | ✅ **Implémentée** | 4 locations ciblées sur 1 259 URL, le reste en vente. Petit volume assumé : une agence de quartier publie peu mais tôt, et une source Apimo inchangée coûte deux requêtes (§30).                                                                    |
| **Votre Agence Immo** (votre-agence-immo.fr) | 2026-09-04 | ⏸️ Écartée         | robots.txt permissif, mais 3 locations ciblées seulement et plateforme inconnue : un scraper sur mesure pour trois annonces ne se rentabilise pas.                                                                                                  |
| **Superimmo** (superimmo.com)                | 2026-09-04 | ⏸️ Écartée         | Agrégateur, pas une agence. `sitemap.xml` en 404 et robots.txt interdisant les endpoints JSON de listes : aucune voie de collecte conforme.                                                                                                         |
| **DG Immo** (dgimmo.fr)                      | 2026-08-17 | ✅ **Implémentée** | ~4 locations Nice + Saint-Laurent-du-Var.                                                                                                                                                                                                           |
| rivolimmo.fr                                 | 2026-08-17 | ⚪ Apimo confirmé  | Sitemap quasi vide (1 fiche) — à activer si le stock apparaît.                                                                                                                                                                                      |

**Plateforme « La Boîte Immo / Hektor »** — adaptateur générique implémenté le
2026-08-17 (`sources/hektor`, même logique que l'adaptateur Apimo) : listes
SSR → fiches nouvelles uniquement ; table clé/valeur `table-aria` (CP, pièces,
meublé, loyer CC, charges), photos `staticlbi.com` ; DPE non extrait (image
générée sous /admin, interdit par robots → laissé inconnu, §17).

| Source                                          | Vérifié    | Verdict                                                                      | Détail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------- | ---------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Giletta Immobilier** (giletta-properties.com) | 2026-08-17 | ✅ **Implémentée**                                                           | ~47 fiches location à Nice, majoritairement étudiantes exclusives (écartées par le filtre) — le reste est le meilleur volume unitaire trouvé. Dates de disponibilité dans les titres.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **LT Immobilier** (lt-immobilier.com)           | 2026-08-17 | ✅ **Implémentée**                                                           | Seule couverture **La Trinité/Drap/Paillon**. Stock faible mais stratégique ; sitemap sans fiches → collecte par la liste `/a-louer/1`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Agence du Centre** (agenceducentrenice.com)   | 2026-08-17 | ✅ **Implémentée**                                                           | ~5 locations Nice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Dinamy Immobilier** (dinamyimmobilier.com)    | 2026-09-03 | ✅ **Implémentée**                                                           | Agence Nice (13 rue François Guisol), demandée explicitement le 2026-08-27. Application PHP maison, SSR, sans anti-bot ; pas de robots.txt (404) donc rien d’interdit. La liste porte prix et référence dans le querystring, et la surface + les pièces sont encodés dans le CHEMIN DES PHOTOS (`Ap3P-53-Nice-Cimiez-51`). Pagination par POST lié à la session PHP. La location SAISONNIÈRE (`transactions=4`, prix à la nuitée) n’est jamais collectée. **Fiches visitées depuis le 2026-09-03**, pour les annonces NOUVELLES seulement : elles seules portent la description — qui nomme la rue (« Rue Smolett… ») et signale les baux étudiants 9 mois — et le diaporama complet (6 photos contre 1). La page pèse 2 Mo, dont l’essentiel est la liste des 35 000 communes de France réinjectée partout : d’où le plafond de 8 fiches par run. |
| **Borne & Delaunay** (borne-delaunay.com)       | 2026-09-04 | ✅ **Implémentée**                                                           | Agence Nice (gestion locative, syndic), demandée explicitement. `robots.txt` n'interdit que `/contacts/success_landing`. Site Rails maison, SSR, sans anti-bot. La page `/immobilier/louer-13` porte toutes les locations, cartes complètes (titre d'accroche qui nomme souvent le quartier, ville, CP, type, pièces, surface, loyer, photo) : une requête, aucune visite de fiche. Relevé du 2026-09-04 : 3 locations, toutes à Nice, 882 à 1 650 € — au-dessus du budget actuel, mais le stock tourne.                                                                                                                                                                                                                                                                                                                                           |
| immobiliere-pelou.com                           | 2026-08-17 | ✅ **Implémentée le 2026-09-14** — 1 location à l'année (Villeneuve-Loubet). |
| aagestion.net                                   | 2026-08-17 | ✅ **Implémentée le 2026-09-14** — 6 locations (Nice ×5).                    |
| agencedesdomaines.com (Cagnes)                  | 2026-08-17 | ✅ **Implémentée le 2026-09-14** — 1 garage au relevé.                       |

**Plateforme « Netty »** — adaptateur générique implanté le 2026-09-05
(`sources/netty`), troisième plateforme couverte après Apimo/Cello et
Hektor/La Boîte Immo. Signature : `robots.txt` n'interdisant que `/*.pdf` et
demandant `Crawl-delay: 5` (**respecté : le budget passe de 4 à 5 s**, une
demande de délai ne s'arrondit pas à la baisse) ; sitemap déclaré, **sans
`lastmod`** mais petit et purgé ; fiches `/{location|vente}/{slug}-{CP},{réf}` ;
JSON-LD `Product` dont le bien tient sous `offers.itemOffered` — deux niveaux
plus bas que chez Apimo, ce qui rendait l'adaptateur existant inutilisable tel
quel.

Deux points méritent d'être retenus pour les prochaines instances :

- **Les classes CSS sont hachées** (`_1o6jcyu`, `_s2u4i5`) et changent à chaque
  reconstruction du thème. Le parser ne vise que du STRUCTUREL : les composants
  `[data-author="Netty.fr"]`, les `<li>` à deux éléments de texte, les
  intertitres en toutes lettres. Un test reconstruit la fiche avec des classes
  toutes différentes et vérifie qu'elle se lit encore.
- **Les charges ne vivent que dans les mentions légales.** Ni les
  caractéristiques ni le JSON-LD ne les portent. Ce bloc, engendré par la
  plateforme, donne aussi le loyer de base, le dépôt de garantie et les classes
  énergie/climat. On le reconnaît à sa tournure machinale (« Loyer de base X
  €/mois », « Classe énergie C, Classe climat A ») et non au mot
  « honoraires » : la description rédigée par l'agence reprend souvent les
  mêmes informations à sa façon, et se faisait prendre pour le bloc légal.

| Source                                                 | Vérifié    | Verdict            | Détail                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ---------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Centragence** (centragence.net)                      | 2026-09-05 | ✅ **Implémentée** | Agence indépendante niçoise depuis 2006, demandée explicitement. 9 locations ciblées sur 25 URL. Fiches très complètes : loyer, provision sur charges, dépôt, honoraires, classes énergie et climat, étage, exposition, ameublement, et le **type de bail** — plusieurs locations étudiantes de septembre à juin. |
| **I.C.I Info Conseil Immobilier** (ici-immobilier.com) | 2026-09-05 | ✅ **Implémentée** | Demandée explicitement sous « INFO CONSEIL IMMOBILIER ». N'était connue que par la FNAIM, qui n'en relayait qu'une annonce ; son site en publie davantage, avec la description complète. 4 locations au relevé — petit volume assumé (§30 : une source Netty inchangée coûte une requête).                        |

**The New Agency / La Nouvelle Agence** et **EMERIA EUROPE**, demandées le même
jour, n'ont pas été retenues — faute d'objet, non de conformité :

| Source                              | Vérifié    | Verdict    | Détail                                                                                                                                                                                                                                                      |
| ----------------------------------- | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The New Agency / La Nouvelle Agence | 2026-09-05 | ⏸️ Écartée | Aucune agence de ce nom à Nice n'a pu être identifiée avec certitude : les résultats renvoient soit à une agence de Château-Thierry, soit à des noms voisins (L'Agence, Nice Agency). On ne devine pas un domaine (§17) — **l'URL exacte reste à fournir**. |
| EMERIA EUROPE                       | 2026-09-05 | ⏸️ Écartée | Holding (ex-groupe Foncia), et non une agence : elle ne publie aucune annonce en propre. Ses enseignes sont déjà collectées séparément — **Foncia** et **Lamy** figurent parmi les sources actives.                                                         |

Écartés notables : portissim, renoirimmobilier, alpesazur, portimmo,
atrioimmobilier, riviera-bay, azur-mediterranee (hébergeur coupant les clients
non-navigateur — on ne contourne pas, §10) ; nicolaspisani.com (robots
interdit les annonces).

Méthode pour la suite :

1. Recenser les agences niçoises indépendantes (annuaire FNAIM, cartes, pages
   « agences » des réseaux) et noter l'URL de leur site.
2. Identifier la **plateforme technique** de chaque site. La majorité des sites
   d'agences françaises sont générés par une poignée de prestataires
   (Ubiflow, Apimo, Hektor/La Boîte Immo, Netty, WebGenery…). Un seul adaptateur
   générique par plateforme couvre alors des dizaines d'agences (§5, §47).
3. Vérifier robots.txt + CGU de chaque site avant activation.
4. Configurer chaque agence comme une _instance_ de l'adaptateur : domaine,
   chemin de recherche, budget `localAgency` (1 page, 4 s de délai, 1-4 h
   d'intervalle — §7).

### Square Habitat

| Source                                | Vérifié    | Verdict    | Détail                                                                                                                                                                                                                                     |
| ------------------------------------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Square Habitat** (squarehabitat.fr) | 2026-08-15 | 🔴 Écartée | Le `robots.txt` interdit précisément les pages de résultats et de fiches location : `/resultat-location`, `/resultats-agence` et `/sh-*/louer-appartement-*.aspx`. Les annonces qu'on voudrait lire sont donc hors d'accès conforme (§10). |

### Agrégateurs

| Source                    | Vérifié    | Verdict                 | Détail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ---------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rentumo** (rentumo.com) | 2026-09-03 | ✅ **Implémentée**      | Demandée explicitement, et retenue **en connaissance de cause** (décision utilisateur du 2026-09-03). `robots.txt` permissif : `Allow: /`, seuls `*?sort_by=*`, `/users/sign_in` et `/search-agents/new` sont interdits ; sitemap déclaré. Pages `/rent-apartment/nice?page=N` entièrement SSR, 21 annonces par page, pagination en `<link rel="next">`. **TROIS RÉSERVES, assumées :** aucun lien vers l'annonce d'origine ; coordonnées **floutées derrière un abonnement payant** ; champs annoncés par le site lui-même comme « extracted by AI … may not be 100% accurate ». On ne retient donc que ce que la carte affiche tel quel, et on ne visite jamais les fiches (§30). **Ce qui la sauve :** les photos passent par un proxy dont l'URL encode en base64 l'adresse **d'origine** — on la décode, ce qui donne la photo en pleine qualité et révèle l'hébergeur du site source. Sur un relevé de 104 images : FNAIM 40, La Boîte Immo (Giletta) 30, borne-delaunay 12, CloudFront 12, maisonsetappartements 6, Orpi 4.                                                                                                                                                                               |
| **Jinka** (jinka.fr)      | 2026-09-04 | 🟠 Par e-mail seulement | Demandée explicitement. `robots.txt` très permissif (`Allow: /`, seuls `/sign/*` et `/agency/*?page=` interdits) et les agents d'IA y sont nommés avec les mêmes règles — la conformité n'est donc pas le problème. **Le problème, c'est qu'il n'y a rien à lire.** Jinka n'expose AUCUNE page publique d'annonces : le site est une application Next.js dont toutes les routes utiles (`/alerts`) sont derrière un compte, `sitemap.xml` renvoie 404, et l'accueil porte `<meta name="robots" content="noindex">`. Relevé du 2026-09-04 : les seuls liens publics sont marketing (`/pro`, `/cgu`, `/arnaques`, `/qui-sommes-nous`). Scraper un compte connecté serait automatiser une session personnelle, ce que le projet ne fait pas (§6, §10). **LA VOIE CONFORME EXISTE ET EST DÉJÀ CONSTRUITE** : Jinka envoie ses alertes par e-mail, et le projet importe déjà les digests SeLoger et Bien’ici (`sources/email-alerts`). Il ne manque qu'une chose pour l'ajouter : **un vrai e-mail d'alerte Jinka**, pour en lire la structure plutôt que la deviner (§17). Créez une alerte Nice vers l'adresse déjà surveillée, et le premier message reçu suffira à écrire l'entrée `jinka` du registre `PORTALS`. |
| **MoteurImmo**            | 2026-08-14 | 🟠 Cas particulier      | Voir la section « Portails » : utile à la _découverte_ d'agences, pas comme source primaire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Sources demandées mais NON retenues (accès non conforme)

Étudiées à la demande de l'utilisateur ; aucune ne viole le §10 (on ne
contourne rien), mais aucune n'offre d'accès conforme aux annonces de Nice.

| Source            | Vérifié    | Verdict                          | Détail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ---------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **manda.fr**      | 2026-08-15 | 🔴 Écartée                       | Gestion locative / estimation. Le sitemap ne contient que des annonces de **vente** et des pages SaaS ; les locations passent par `/location-immobiliere?…` (paramètres interdits par robots.txt) et sont chargées en AJAX. Pas de liste de locations Nice exploitable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **123loger.com**  | 2026-08-15 | ✅ **Implémentée le 2026-09-22** | Verdict d'époque : sitemap **cassé** (1127 entrées identiques `/location/`, aucune fiche) et `/search/` interdite, donc inventaire non explorable. **Périmé deux fois** — voir le 2026-09-16 plus bas, puis l'implémentation du 2026-09-22 : l'inventaire niçois ne passe ni par le sitemap ni par `/search/`, mais par le chemin public `/location/nice-06000/appartement/`.                                                                                                                                                                                                                                                                                                                                                                                                 |
| **studapart.com** | 2026-08-18 | ✅ **Implémentée** (API)         | Logement étudiant. Le HTML est en AJAX (page ville « 000 logements », zéro lien de fiche), MAIS les annonces viennent d'une **API de recherche publique** : `POST https://search-api.studapart.com/property` (proxy Elasticsearch, msearch). Cette API n'a pas de robots ; l'hôte principal autorise le crawler générique en `search/reference`, usage exact de Maïoun. Une seule requête rend jusqu'à **201 biens dédoublonnés** pour une ville (48 pour Nice), avec adresse EXACTE (`full_address`), surface, loyer CC (`rentWithExpensesAmount`), meublé (`isFurnished`), colocation (`rentedByRoom`), CP, géoloc et `canonicalUrls.fr`. Reste à câbler le **POST** dans le client HTTP (aujourd'hui GET+cache) puis à écrire le parseur. Recette dans la note ci-dessous. |

Note studapart : accès conforme trouvé le 2026-08-18. `robots.txt` du site principal autorise le crawler générique (`Content-Signal: search=yes, use=reference`) et n'exclut que les bots d'entraînement d'IA ; l'API `search-api.studapart.com` n'a pas de robots. **Recette** : `POST /property`, `content-type: application/json`, corps
`{"data":[{"index":["search_properties_prod","residence_properties_prod"]},{"size":0,"body":{"query":{"bool":{"filter":[{"term":{"online":true}},{"terms":{"tags":["search-<ville>"]}},{"term":{"announcementType":"rental"}}]}},"aggs":{"distinctProperties":{"terms":{"field":"distinctId","size":201},"aggs":{"hit":{"top_hits":{"size":1}}}}}}}]}`.
Réponse : `responses[0].aggregations.distinctProperties.buckets[].hit.hits.hits[0]._source`. Le tag `search-<ville>` se dérive du slug (ex. `search-nice`). Attention : beaucoup de biens sont en **colocation** (`rentedByRoom: true`) → écartés par le filtre perso, c'est voulu.

### Balayage systématique du 2026-09-05

Méthode reproductible, à préférer aux recherches web qui ne rendent que des
domaines devinés : l'**annuaire FNAIM des agences niçoises**
(`/agences-immobilieres/43-nice-06000.htm`, non interdit par son robots.txt)
donne les sites des agences adhérentes. Vingt-trois domaines externes en sont
sortis, tous passés à `scripts/probe-agency.mjs`.

| Source                                                                                                                       | Vérifié    | Verdict                                                                | Locations ciblées                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Immo JBF** (immo-jbf.com)                                                                                                  | 2026-09-05 | ✅ **Implémentée**                                                     | **151** — la plus grosse source locale du projet.                                                                                                                                                                                                       |
| **Immo 3000** (immo3000.com)                                                                                                 | 2026-09-05 | ✅ **Implémentée**                                                     | 63, uniquement des appartements.                                                                                                                                                                                                                        |
| **Acropolis Immobilier** (acropolisimmo.com)                                                                                 | 2026-09-05 | ✅ **Implémentée**                                                     | 49.                                                                                                                                                                                                                                                     |
| **Partners Immo** (partners-immo.fr)                                                                                         | 2026-09-05 | ✅ **Implémentée**                                                     | 33.                                                                                                                                                                                                                                                     |
| **Agence Longchamp** (agencelongchamp.com)                                                                                   | 2026-09-05 | ✅ **Implémentée**                                                     | 10, le reste en commerces.                                                                                                                                                                                                                              |
| **Cimiez Boulevard** (cimiez-boulevard.fr)                                                                                   | 2026-09-05 | ✅ **Implémentée**                                                     | 7 locations, mais les MIEUX renseignées de l'inventaire : charges, quartier, GPS, photos, meublé sur chaque fiche. Le quartier figure dans l'adresse — couverture totale là où elle plafonne à 16 % ailleurs. Premier parseur hors plateforme partagée. |
| **AGIR** (agir.immo)                                                                                                         | 2026-09-05 | ✅ **Implémentée le 2026-09-14** — 2, écartée d'abord pour son volume. |
| 107promenade, agencecalifornie, agerim, aifelimmo, barbera-gestion, cabinet-bgi, cabinetamandola, immobilier-nice, savi-nice | 2026-09-05 | ⏸️ Écartées                                                            | 0 location ciblée, ou site injoignable.                                                                                                                                                                                                                 |

**APIMO DOMINE NICE**, et c'est le fait qui compte pour la suite : cinq des six
candidats retenus sont sur cette plateforme. Ajouter une agence Apimo coûte
dix-huit lignes ; écrire un scraper pour une plateforme rencontrée une seule
fois en coûte deux cents. Tant que la fabrique Apimo couvre la majorité, c'est
là qu'est le rendement.

### Balayage du 2026-09-14 : les agences que le catalogue voyait sans les lire

**Consigne du propriétaire, même jour : le volume ne compte pas.** Toute agence
conforme qui a au moins une location dans la zone est collectée et gardée
active, même pour une ou deux annonces. Seules sont écartées les agences sans
location dans la zone, celles qui ferment l'accès, et celles qu'on n'a pas pu
identifier avec certitude.

**Méthode, réutilisable.** Deux lectures, sans rien deviner :

1. Le catalogue de Maïoun (API publique, 3 270 fiches) : les noms d'agences des
   annonces que seules FNAIM, Bien'ici, ParuVendu, LocService et les alertes
   e-mail apportent.
2. La recherche Bien'ici déjà collectée (515 locations à Nice, six requêtes).
   Chaque annonce y trahit le LOGICIEL de l'agence par son identifiant
   (`apimo-…`, `hektor-{compte}-…`, `netty-company…`, `gedeon-…`, `ag0…` pour
   Ubiflow) et souvent son SITE par `agencyFeeUrl`, le lien vers le barème
   d'honoraires : `https://www.midem-immobilier.fr/i/redac/honoraires` donne le
   domaine d'une agence La Boîte Immo sans aucune recherche.

Chaque domaine a ensuite été confirmé par sa page d'accueil ou ses mentions
légales (raison sociale, adresse dans les Alpes-Maritimes), puis sondé :
`robots.txt`, signature de plateforme, comptage des locations de la zone, et
lecture d'une vraie fiche par l'adaptateur du projet.

**Ce que le balayage a corrigé dans les adaptateurs.**

- **La Boîte Immo** sert au moins quatre gabarits de fiche. Seul le plus récent
  (table `table-aria`) se lisait : plus de la moitié des agences sondées
  rendaient « Fiche sans prix ». Le parseur lit désormais les libellés que tous les
  gabarits écrivent (« Loyer CC\* / mois », « Code postal », « Surface
  habitable (m²) », « Charges locatives… », « La ville de … »), la description
  de chaque gabarit, et ne prend plus le département préfixé
  (`/06-alpes-maritimes/1-nice/`) pour la commune.
- **Apimo, ancien schéma** (`/fr/propriété/{id}`) : le scraper d'Agence
  Privilège avait l'adresse de sa liste écrite en dur. Il devient une fabrique
  (`apimo/list-scraper.ts`), qui sert aussi Reynier, Picado, Cordier, L'Agent
  Niçois et Postillon.
- **Netty** accepte une adresse de fiche sans code postal (Ferrero).
- **Normalisation** : « Duplex 4 pièce(s) 3 chambre(s) » était typé
  « chambre », donc écarté de la recherche. Un nombre de chambres ne désigne
  plus une chambre.

**Soixante-dix sources ajoutées** : 28 La Boîte Immo, 24 Apimo, 5 Apimo ancien
schéma, 5 Netty, 8 parseurs dédiés (dont Immo de France, réseau Procivis).

**Coût par passage.** Une agence La Boîte Immo coûte une requête de liste (deux
pour Roseland et GTI) ; une agence Apimo ou Netty, son sitemap (conditionnel,
souvent un index et une page) ; une agence Apimo ancien schéma ou à parseur
dédié, sa liste. S'y ajoutent, pour les seules annonces NOUVELLES (et les fiches
jamais lues), une requête par fiche, plafonnée à six ou huit. En régime établi :
environ 100 requêtes pour les 70 sources, chacune sur son propre hôte, au délai
de 4 s (5 s pour Netty).

#### Implémentées — La Boîte Immo (adaptateur `hektor`)

| Source                                             | Vérifié    | Locations relevées                                                                                                                   |
| -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Immobilière Roseland** (immobiliereroseland.fr)  | 2026-09-14 | 17 sur deux pages, Nice en majorité                                                                                                  |
| **SAG Immobilier** (sag-immobilier.com)            | 2026-09-14 | 11, toutes à Nice                                                                                                                    |
| **Sud Agence** (sudagence.fr)                      | 2026-09-17 | 9 à Nice (dont 2 stationnements)                                                                                                     |
| **AA Gestion** (aagestion.net)                     | 2026-09-14 | 6 (Nice ×5, Grasse)                                                                                                                  |
| **Murta Immobilier** (murta-immobilier.com, Drap)  | 2026-09-14 | 6 (Nice ×2, Drap, Contes, arrière-pays)                                                                                              |
| **Aurus Immobilier** (aurusimmo.com, Beaulieu)     | 2026-09-14 | 5 (Nice ×3, Beaulieu-sur-Mer, Roquebrune)                                                                                            |
| **ANG Immobilier** (agence-nice-gambetta.fr)       | 2026-09-14 | 5 à Nice (dont 2 stationnements)                                                                                                     |
| **Agence Passy** (agencepassy.com)                 | 2026-09-14 | 4 (logements et garages)                                                                                                             |
| **Immobilier Côté Village** (La Trinité)           | 2026-09-14 | 4 (La Trinité ×3, Nice)                                                                                                              |
| **Midem Immobilier** (midem-immobilier.fr)         | 2026-09-14 | 4 (Nice ×3, Villeneuve-Loubet)                                                                                                       |
| **Coprogestimmo** (coprogestimmo.fr)               | 2026-09-14 | 4 (Nice ×2, Menton ×2)                                                                                                               |
| **Liberty Agency** (agence-liberty.com)            | 2026-09-14 | 3 à Nice                                                                                                                             |
| **Englimmo** (englimmo.com)                        | 2026-09-15 | 3 à Nice, étudiantes ou en colocation                                                                                                |
| **Belgravia** (belgravia.fr)                       | 2026-09-14 | 2 (Nice, Villefranche-sur-Mer)                                                                                                       |
| **De Vita Immobilier** (devita.immo)               | 2026-09-14 | 2 à Nice                                                                                                                             |
| **L&B Immobilier** (lb-immobilier.fr)              | 2026-09-14 | 2 à Nice                                                                                                                             |
| **Sud Contact** (nice-ouest-immobilier.com)        | 2026-09-14 | 2 à Nice (un studio, une chambre en colocation)                                                                                      |
| **Maison Quatre** (maisonquatre.la-boite-immo.com) | 2026-09-14 | 2 à Nice                                                                                                                             |
| **Riviera Concept** (rivieraconcept.com)           | 2026-09-14 | 2 à Nice                                                                                                                             |
| **L’Agence Azuréenne** (lagenceazureenne.com)      | 2026-09-15 | 2 (Nice Californie, Villeneuve-Loubet)                                                                                               |
| **Cabinet AGIR** (agir.immo)                       | 2026-09-16 | 2 (Nice, Le Rouret) — e-mail, chambres et étage gagnés le 2026-09-16 ; DPE en image sous `/admin`, interdit par robots, donc inconnu |
| **Cabinet Nardi** (cabinetnardi.com)               | 2026-09-14 | 1 à Nice                                                                                                                             |
| **Immo Consult Côté Sud** (immoconsultcotesud.com) | 2026-09-14 | 1 à Nice                                                                                                                             |
| **Immobilière Pelou** (Villeneuve-Loubet)          | 2026-09-14 | 1 à l'année ; la page saisonnière n'est jamais lue                                                                                   |
| **Agence des Domaines** (Cagnes-sur-Mer)           | 2026-09-14 | 1 garage ; gardée pour les logements à venir                                                                                         |
| **Immobilière GTI** (immobilieregti.com, Orpi)     | 2026-09-14 | 16 sur deux pages, dont 14 à Nice                                                                                                    |
| **Groupe Marshall** (cabinet-marshall.com)         | 2026-09-14 | 5 dans la zone (Nice ×3, Cagnes, Saint-Laurent-du-Var)                                                                               |
| **Méditerranée Immo** (mediterranee-immo.fr)       | 2026-09-14 | 4 à Nice, pour étudiants                                                                                                             |
| **Bérénice Immobilier** (berenice-immobilier.com)  | 2026-09-14 | 3 à Nice ; commune tirée du code postal                                                                                              |
| **Orpi Agence Contesso** (agence-contesso.com)     | 2026-09-14 | 3 (Nice, Carros ×2)                                                                                                                  |
| **Anne-Sophie Lapierre** (lapierre-immobilier.com) | 2026-09-14 | 2 (Nice, Cagnes-sur-Mer)                                                                                                             |

#### Implémentées — Apimo (adaptateur `apimo`, sitemap)

Les sitemaps Apimo gardent des fiches louées : le compte ci-dessous est celui
du sitemap, et l'adaptateur écarte déjà ce qui a plus d'un an ou se déclare
loué.

| Source                                             | Vérifié    | Locations ciblées au sitemap                                                                                                                                         |
| -------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agence Gounod** (agencegounod.com)               | 2026-09-16 | 40 (Nice 39, Saint-Laurent-du-Var) — « l'agence des Musiciens », installée rue Gounod depuis 1980 ; le saisonnier vit sous `/fr/propriete-saisonniere/`, jamais lu   |
| **Masséna Immobilier** (massena-immo.com)          | 2026-09-14 | 39, toutes de 2026                                                                                                                                                   |
| **PHT Real Estate** (phtrealestate.com)            | 2026-09-14 | 39 (26 de 2024-2025)                                                                                                                                                 |
| **Immobilier 2 Nice** (immobilier2nice.com)        | 2026-09-14 | 31, surtout 2025 (2 en ligne sur Bien'ici)                                                                                                                           |
| **Reutter Invest** (reutterinvest.fr)              | 2026-09-14 | 28                                                                                                                                                                   |
| **A Alliance Conseil** (allianceconseilimmo.com)   | 2026-09-14 | 25                                                                                                                                                                   |
| **Vizcaya** (vizcaya.fr)                           | 2026-09-16 | 24 (Nice 22, Cagnes, Villefranche) — position, quartier et DPE en clair depuis le 2026-09-16                                                                         |
| **Cabinet Ventura** (cabinetventura.com)           | 2026-09-14 | 22 (14 logements)                                                                                                                                                    |
| **FDS Carré d'Or** (fdscarredor.com)               | 2026-09-14 | 10                                                                                                                                                                   |
| **Marcele Immobilier** (ballestri-immobilier.com)  | 2026-09-14 | 6 — ex-Ballestri, nommée par les mentions légales                                                                                                                    |
| **Home Pearl** (homepearl.immo)                    | 2026-09-14 | 5 en ligne (104 au sitemap)                                                                                                                                          |
| **Réussite Immo Nice** (immonice06.fr)             | 2026-09-14 | 5                                                                                                                                                                    |
| **Joseph Garnier** (josephgarnier.fr)              | 2026-09-14 | 5                                                                                                                                                                    |
| **Sambroni Immobilier** (agencesambroni.com)       | 2026-09-14 | 5                                                                                                                                                                    |
| **5 Stars Holiday House** (Sima Immobilier)        | 2026-09-16 | 58 au sitemap, 5 à l'année ou étudiantes ; saisonnier sur un autre site. C'est le site de **Sima / Simma Immobilier**, rue de la Buffa : l'agence n'en a pas d'autre |
| **BôMarché by Lambda** (bomarche.fr)               | 2026-09-14 | 4                                                                                                                                                                    |
| **Provencalpes** (provencalpes.fr)                 | 2026-09-14 | 4 (Nice, Contes, Drap)                                                                                                                                               |
| **FIT Immobilier** (fit-immobilier.com)            | 2026-09-14 | 3                                                                                                                                                                    |
| **Agence Riviera Real Estate** (agenceriviera.com) | 2026-09-14 | 2 en ligne                                                                                                                                                           |
| **Diffusion Immobilière** (difimmo.com)            | 2026-09-14 | 2                                                                                                                                                                    |
| **La Conca d'Or** (laconcador.com)                 | 2026-09-14 | 1                                                                                                                                                                    |
| **Étude Lotte** (etudelotte.com)                   | 2026-09-14 | 1 en ligne                                                                                                                                                           |
| **Nice Premium Immobilier**                        | 2026-09-14 | 1 ; pas de page de locations, le sitemap seul                                                                                                                        |
| **Immobilière Victor Hugo**                        | 2026-09-14 | 1                                                                                                                                                                    |
| **La Firme** (proazurdagasso.com)                  | 2026-09-14 | 1 (une chambre en colocation)                                                                                                                                        |

#### Implémentées — Apimo ancien schéma (`apimo/list-scraper.ts`)

| Source                                             | Vérifié    | Locations relevées                                      |
| -------------------------------------------------- | ---------- | ------------------------------------------------------- |
| **Cabinet Reynier** (cabinet-reynier.com)          | 2026-09-14 | 11 sur deux pages (Nice, Cap-d'Ail, Cagnes, St-Laurent) |
| **Groupe Picado** (groupepicado.com)               | 2026-09-14 | 9 (Nice ×8)                                             |
| **Cabinet Cordier** (cabinetcordier.com)           | 2026-09-14 | 4-5 à Nice                                              |
| **L'Agent Niçois** (agentnicois.com)               | 2026-09-14 | 1 à Nice                                                |
| **Postillon Immobilier** (postillon-immobilier.fr) | 2026-09-14 | 3 à Nice                                                |

#### Implémentées — Netty (adaptateur `netty`)

L'adaptateur accepte désormais une adresse de fiche SANS code postal
(`location-appartement-nice,LA1968`, relevée chez Ferrero) : la commune se lit
sur la fin du slug, le code postal sur la fiche.

| Source                                            | Vérifié    | Locations relevées                                                      |
| ------------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| **Optimmo** (groupe-optimmo.fr)                   | 2026-09-14 | 10 ciblées (Nice ×8 dont parkings et locaux, Cagnes, Villeneuve-Loubet) |
| **AM Concept Patrimoine** (amconcept.immo)        | 2026-09-14 | 2 (un studio à Nice, un bureau à La Trinité)                            |
| **Lumina Immobilier** (lumina-immo.fr)            | 2026-09-14 | 1 colocation à Nice                                                     |
| **Lienhard Immo** (lienhardimmo.fr, Alsace)       | 2026-09-14 | 1 à Nice ; le reste du sitemap écarté sans visite                       |
| **Agence Ferrero** (ferrero-immobilier.fr, Vence) | 2026-09-14 | 1 à Nice ; Vence et Tourrettes écartées                                 |

#### Implémentées — parseurs dédiés

Un socle commun, `shared/list-and-details.ts` : la liste (ou le sitemap) à
chaque passage, les fiches par `enrichNewListings`, et une annonce rendue
seulement si elle a un loyer au mois. `shared/labels.ts` lit les « libellé :
valeur » des fiches à gabarit maison.

| Source                                          | Vérifié    | Plateforme                      | Locations relevées                      | Coût par passage                   |
| ----------------------------------------------- | ---------- | ------------------------------- | --------------------------------------- | ---------------------------------- |
| **Carletta Immobilier** (carletta.fr)           | 2026-09-14 | Bexter, windows-1252            | 11 à Nice                               | sitemap + fiches nouvelles (≤ 8)   |
| **Concept Patrimoine** (conceptpatrimoine.fr)   | 2026-09-14 | WordPress, import Netty         | 9 (Nice ×6, dont 3 logements au total)  | liste + fiches nouvelles (≤ 6)     |
| **Cabinet Griguer** (griguer-immobilier.com)    | 2026-09-14 | WordPress Essential Real Estate | 7 à Nice (4 logements)                  | recherche + fiches nouvelles (≤ 8) |
| **Cabinet Crouzet & Breil** (crouzet-breil.com) | 2026-09-14 | WordPress Elementor, flux Apimo | 7 à Nice                                | liste + fiches nouvelles (≤ 8)     |
| **Kapera Immobilier** (kapera-immobilier.com)   | 2026-09-14 | WordPress Elementor, flux Apimo | 7 (Nice ×5)                             | liste + fiches nouvelles (≤ 8)     |
| **MK Immo** (mk-immo.fr, ex-MCE Immobilier)     | 2026-09-14 | Twimmo                          | 10 (Nice ×4, Cagnes, Villeneuve-Loubet) | liste + fiches nouvelles (≤ 8)     |
| **Immo de France Côte d’Azur** (procivis.fr)    | 2026-09-14 | Procivis, JSON-LD               | 7 appartements dans le 06, 4 à Nice     | 2 listes + fiches nouvelles (≤ 6)  |
| **SAFI Méditerranée** (safimediterranee.fr)     | 2026-09-14 | WordPress Houzez, flux Apimo    | 3 à Nice (chalets à la semaine écartés) | liste + fiches nouvelles (≤ 6)     |

Deux particularités assumées : Kapera qualifie parfois de « hors charges » un
loyer que sa description donne charges comprises — on reprend ce que le site
affiche, sans recalcul ; Crouzet & Breil ne nomme la commune qu'en tête de la
description (« NICE NORD – 36 BD GORBELLA »), lue telle quelle.

#### Examinées, non implémentées

| Candidate                                                                                                                                                   | Vérifié    | Verdict                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Confiance Immobilière** (confianceimmobiliere.com)                                                                                                        | 2026-09-17 | ⏸️ Plus de site : maintenance en clair, pas d'hôte HTTPS, `robots.txt` en 404. Passée à **Netty** d'après ses annonces Bien'ici, mais son site Netty n'est pas publié. 8 locations à Nice, vues par Bien'ici. Étude en fin de fichier.      |
| **JS Immobilier** (jsimmobilier.fr)                                                                                                                         | 2026-09-14 | 🔴 Défi anti-bot AWS dès la page d'accueil et le robots.txt : non contourné.                                                                                                                                                                |
| **Nexity, Guy Hoquet, Nestenn, Square Habitat**                                                                                                             | 2026-09-14 | 🔴 Verdicts inchangés. Guy Hoquet Nice Gambetta publie 1 location, lisible par son sitemap Immo-Facile : à reprendre si le stock grossit.                                                                                                   |
| **Sixième Avenue** (ex-Stéphane Plaza Nice)                                                                                                                 | 2026-09-14 | 🔴 Les agences Stéphane Plaza de Nice sont devenues Sixième Avenue ; la liste passe par un appel `/agency/products/…` qui répond 403.                                                                                                       |
| **L'Agence Rivoli** (lagencerivoli.fr)                                                                                                                      | 2026-09-14 | 🔴 Recherche en POST AJAX, réponse compressée : pas de page de liste lisible, pour ~2 annonces.                                                                                                                                             |
| **SOCOPRO** (socopro.fr)                                                                                                                                    | 2026-09-14 | 🟡 WordPress « WP Pro », ~4 locations ; le statut « LOUÉ! » n'est écrit que dans la description. Parseur dédié, une demi-journée.                                                                                                           |
| **Parnasse Immobilier** (parnasse-immobilier.com)                                                                                                           | 2026-09-14 | 🟡 WordPress WP Residence, 3 appartements à Nice parmi parkings et commerce. Parseur dédié, une demi-journée.                                                                                                                               |
| **Nicolas Pisani / Bellevue Real Estate**                                                                                                                   | 2026-09-14 | 🟡 Site ColdFusion : la liste « locations à l'année » est autorisée (6 villas et appartements haut de gamme dans la zone). Le verdict « robots interdit les annonces » du 2026-08-17 est à relire avant tout travail.                       |
| **iad France** (iadfrance.fr)                                                                                                                               | 2026-09-14 | 🟡 `/annonces/pg-nice_06/location` et les fiches sont autorisées ; ~4 locations dans la zone. Données dans `__NUXT_DATA__`. Une demi-journée.                                                                                               |
| **Century 21 Lafage** (century21-lafage-nice.com)                                                                                                           | 2026-09-14 | 🟡 22 locations dans la zone, lisibles par le parseur century21 existant. La source Century 21 ne lit que les appartements de Nice : lui ajouter maisons, Villefranche et Beaulieu (pages `v-*` autorisées) couvrirait ce stock. Une heure. |
| **Orpi Agence Régionale** (Cagnes-sur-Mer)                                                                                                                  | 2026-09-14 | ✅ Fait le 2026-09-16 : sans site propre, ses annonces de Cagnes et Villeneuve-Loubet sont sur orpi.com, et la source Orpi interroge désormais les treize communes du périmètre.                                                            |
| **Madie Real Estate** (madieimmobilier.fr), **Riviera Angels** (riviera-angels.com)                                                                         | 2026-09-14 | ⏸️ La Boîte Immo, liste de locations vide au relevé.                                                                                                                                                                                        |
| **Les Hespérides / Sopregim** (leshesperides.fr)                                                                                                            | 2026-09-14 | ⏸️ Résidence services seniors : un logement à Nice, réservé à un public âgé, que la recherche n'a pas de critère pour trier.                                                                                                                |
| **DS Immobilier**, **Forimmo**                                                                                                                              | 2026-09-14 | 🔴 `robots.txt` en `Disallow: /` (Forimmo redirige vers la page de fermeture « Ma Boîte Immo »).                                                                                                                                            |
| **Réseau Expertimo** (reseau-expertimo.fr)                                                                                                                  | 2026-09-14 | ⏸️ Réseau national de mandataires, 65 pages de locations sans filtre de commune pour une annonce niçoise.                                                                                                                                   |
| **DAMA** (dama-agency.com)                                                                                                                                  | 2026-09-14 | 🟡 Site Tilda, villas de luxe à Villefranche-sur-Mer. Parseur dédié.                                                                                                                                                                        |
| **Syngestone Immo**, **Cabinet Central Gestion**, **By Gestion**, **NIGESTIM**, **Global Gest**, **CAPGEST**, **Oralia**, **Sergic**, **Mobilité Logement** | 2026-09-14 | ⏸️ Aucune location dans la zone sur leur site (tout loué, syndic sans annonces, ou biens hors zone).                                                                                                                                        |
| **Limandat** (limandat.fr)                                                                                                                                  | 2026-09-14 | ⏸️ Apimo au schéma d'URL incompatible, et uniquement des villas de luxe dans la zone (3 à 23 000 €/mois).                                                                                                                                   |
| Logiciels Gedeon, Ubiflow, Twimmo, Bexter vus sur Bien'ici                                                                                                  | 2026-09-14 | Passerelles vers les portails, pas des gabarits de site : aucun site d'agence niçois n'est sur Gedeon, et Twimmo comme Bexter n'équipent qu'une agence chacun (MK Immo, Carletta). Pas d'adaptateur commun rentable.                        |
| Maison Masséna, Viazur, My Nice Immo, Centre Immobilier, Loiselet & Daigremont (Nice)                                                                       | 2026-09-14 | ⚪ Injoignables ou introuvables : pas de domaine confirmé.                                                                                                                                                                                  |
| Getkey / Agences de France, Diffuze                                                                                                                         | 2026-09-14 | ⏸️ Services de diffusion, pas des agences locales.                                                                                                                                                                                          |
| Riviera Boulevard                                                                                                                                           | 2026-09-14 | ⏸️ Même équipe et même adresse que Cimiez Boulevard, déjà collectée.                                                                                                                                                                        |
| Gabarrou Immobilier                                                                                                                                         | 2026-09-14 | ⏸️ Agence de l'Aude : ses annonces niçoises de fnaim.fr sont gérées par Syngestone, qui ne les publie pas.                                                                                                                                  |

**Un écart à signaler.** Pendant le repérage, une requête vers
`procivis.fr/louer?agency=immo-de-france-nice` est partie AVANT la lecture du
`robots.txt`, qui interdit `/louer?*`. La page a été supprimée sans être lue ; la
source n'utilise que les pages par type et commune, autorisées.

### Balayage de l'annuaire du 2026-09-15 : toutes les agences de Nice

Liste croisée : annuaire SIRENE (codes 68.31Z à Nice et alentours), agences vues
sur les portails sans être lues, pages 1 des annuaires SeLoger et PagesJaunes.
245 agences examinées ; 66 ajoutées. Les agences sans location le jour
du relevé sont suivies quand même : elles en publieront. Une page vide n'est
« vide » que si elle porte le message de la plateforme (« Aucun bien ne
correspond… ») ; sans lui, la source passe en dégradée et ses annonces ne
vieillissent pas.

Écartées : ventes seules, location saisonnière seule, locaux commerciaux, viager,
promoteurs, liquidations, sites introuvables, et les sites fermés aux robots
(Haton Immobilier derrière AWS WAF, Sixième Avenue en 403, Crédit Agricole
Immobilier dont robots.txt interdit la recherche) — aucun contournement.

#### Ajoutées le 2026-09-15 — La Boîte Immo (adaptateur `hektor`)

| Source                                               | Vérifié    | Locations relevées                      |
| ---------------------------------------------------- | ---------- | --------------------------------------- |
| **Cabinet Ledeux Immobilier** (cabinetledeux.com)    | 2026-09-15 | 2 (Nice)                                |
| **Resid’Immo** (residimmo.fr)                        | 2026-09-15 | 2 (Colomars)                            |
| **Gestion Casa Immobilière** (gestion-casa-immo.com) | 2026-09-15 | 4 (Nice ×3, Saint-Laurent-du-Var)       |
| **La Chouette Agence Immobilière** (lachouette.immo) | 2026-09-15 | 1 (Saint-Laurent-du-Var)                |
| **L’Agence Jean Jaurès** (l-agence.fr)               | 2026-09-15 | 2 (Nice, Villeneuve-Loubet)             |
| **Cabinet Marro Immobilier** (marro-immobilier.com)  | 2026-09-15 | 3 (Nice)                                |
| **Immo 3 Points** (immo3points.fr)                   | 2026-09-15 | 6 (Nice ×5 dont 1 cave, Cagnes-sur-Mer) |
| **Riviera Angels Immobilier** (riviera-angels.com)   | 2026-09-15 | 2 (Nice), liste sans liens              |
| **Gestymo** (gestymo.com)                            | 2026-09-15 | 0 aujourd'hui (suivie en attente)       |
| **Azur Conseil Salmon** (acsimmo.fr)                 | 2026-09-15 | 0 aujourd'hui (suivie en attente)       |
| **La Clef Immobilière** (laclefimmobiliere.com)      | 2026-09-15 | 0 aujourd'hui (suivie en attente)       |
| **API Nice** (agence-api.com)                        | 2026-09-15 | 0 aujourd'hui (suivie en attente)       |
| **Phoenix GLV** (phoenix-glv.com)                    | 2026-09-15 | 0 aujourd'hui (suivie en attente)       |
| **Delta Promotion** (delta-promotion.com)            | 2026-09-15 | 0 aujourd'hui (suivie en attente)       |
| **Platine Immobilier** (platineimmobilier.eu)        | 2026-09-15 | 0 aujourd'hui (suivie en attente)       |
| **Westimmo** (westimmo-properties.com)               | 2026-09-15 | 0 aujourd'hui (suivie en attente)       |

#### Ajoutées le 2026-09-15 — Apimo (adaptateur `apimo`, sitemap)

| Source                                                     | Vérifié    | Locations relevées                                                |
| ---------------------------------------------------------- | ---------- | ----------------------------------------------------------------- |
| **Blue Résidences** (blue-residences.fr)                   | 2026-09-15 | 50 au sitemap (Nice, Cagnes-sur-Mer, Saint-Laurent-du-Var)        |
| **La Pérouse Immobilier** (laperouse-immobilier.com)       | 2026-09-15 | 27 au sitemap (Nice, La Trinité, Saint-André-de-la-Roche, Contes) |
| **ISIT Immobilier** (isitimmo.com)                         | 2026-09-15 | 5 (Nice)                                                          |
| **Eric Immo** (eric-immo.com)                              | 2026-09-15 | 15 (Nice, Saint-Laurent-du-Var)                                   |
| **Étude des Vosges** (etudedesvosges.fr)                   | 2026-09-15 | 1 (Nice)                                                          |
| **Valrose Immobilier** (valrose-immo.fr)                   | 2026-09-15 | ~30 (Nice)                                                        |
| **Aparté Immobilier** (aparte-immobilier.com)              | 2026-09-15 | 4 (Nice)                                                          |
| **Abyla Bosse** (immobiliere-abc.com)                      | 2026-09-15 | 5 (Nice)                                                          |
| **Cabinet Central Gestion** (immobilier-cabinetcentral.fr) | 2026-09-15 | 8 (Nice)                                                          |
| **Transactimo** (transactimo-nice.com)                     | 2026-09-15 | 0 aujourd'hui (suivie en attente)                                 |
| **Home on Riviera** (homeonriviera.com)                    | 2026-09-15 | 0 aujourd'hui (suivie en attente)                                 |
| **La Petite Maison** (la-petitemaison.fr)                  | 2026-09-15 | 0 aujourd'hui (suivie en attente)                                 |
| **Maison K Immobilier** (maisonk-immobilier.com)           | 2026-09-15 | 2 (meublés Mont Boron)                                            |
| **Agence Tosca Nice le Port** (agencetosca.com)            | 2026-09-15 | 0 aujourd'hui (suivie en attente)                                 |
| **Acetimo** (acetimo.com)                                  | 2026-09-15 | 0 aujourd'hui (suivie en attente)                                 |

#### Ajoutées le 2026-09-15 — Apimo ancien schéma (`apimo/list-scraper.ts`)

| Source                                                | Vérifié    | Locations relevées                                                      |
| ----------------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| **Agence 5 Promenade** (5promenade.fr)                | 2026-09-15 | 1 (Nice)                                                                |
| **Cegestim** (cegestim.fr)                            | 2026-09-15 | 7 (Saint-Laurent-du-Var ×4 dont 3 parkings, Nice ×2, Villeneuve-Loubet) |
| **Immobilière Camo** (immobiliere-camo.fr)            | 2026-09-15 | 5 (Nice, dont 3 chambres en colocation)                                 |
| **Kalliste Immo Conseil** (kalliste-immo-conseil.com) | 2026-09-15 | 8 (Nice, dont 3 parkings)                                               |
| **Milor Immobilier** (milorimmobilier.com)            | 2026-09-15 | 2 (Nice)                                                                |
| **Cabinet Europazur** (europazur.fr)                  | 2026-09-15 | 2 parkings, 0 logement (suivie en attente)                              |
| **Norait Immobilier** (norait-immobilier.fr)          | 2026-09-15 | 0 aujourd'hui (suivie en attente)                                       |
| **Coccimmo** (coccimmo.com)                           | 2026-09-15 | 0 aujourd'hui (liste, le sitemap garde 13 annonces mortes)              |
| **Immo Idéal** (immo-ideal.fr)                        | 2026-09-15 | 0 aujourd'hui (suivie en attente)                                       |

#### Ajoutées le 2026-09-15 — Netty (adaptateur `netty`)

| Source                                              | Vérifié    | Locations relevées                         |
| --------------------------------------------------- | ---------- | ------------------------------------------ |
| **Sun Immobilia** (sunimmobilia.fr, Cagnes-sur-Mer) | 2026-09-15 | 0 logement aujourd'hui (suivie en attente) |

#### Ajoutées le 2026-09-15 — parseurs dédiés et petits adaptateurs (`twimmo`, `adaptimmo` v2)

| Source                                                             | Vérifié    | Locations relevées                                                   |
| ------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------- |
| **French Riviera Studios** (studios-nice.com)                      | 2026-09-15 | 18 au mois (Nice), WordPress Houzez                                  |
| **Parnasse Immobilier** (parnasse-immobilier.com)                  | 2026-09-15 | 8 (Nice ×7 dont 4 stationnements/cave, Valberg), WP Residence        |
| **La Franco Suisse** (lafrancosuisse.com)                          | 2026-09-15 | 4 (Nice), On'App                                                     |
| **Moss Immobilier** (mossimmobilier.com)                           | 2026-09-15 | 3 (Nice), WordPress + extension Apimo                                |
| **Marchal Immobilier** (marchal-immobilier.fr)                     | 2026-09-15 | 7 (Nice), AdaptImmo nouvelle version                                 |
| **Barbera Gestion & Patrimoine** (barbera-gestion.com)             | 2026-09-15 | 2 (Nice)                                                             |
| **Azurimmo** (azurimmo06.net)                                      | 2026-09-15 | 1 (Nice, studio étudiant)                                            |
| **Richer Immobilier** (richerimmobilier.com)                       | 2026-09-15 | 1 (Nice), WordPress Retro Listings                                   |
| **Grand Métropole** (gdmetropole.com)                              | 2026-09-15 | 1 (Nice), WordPress JetEngine                                        |
| **Elitimo** (elitimo.com)                                          | 2026-09-15 | 4 (Nice ×3, Villeneuve-Loubet), Twimmo                               |
| **Agence Californie** (agencecalifornie.fr)                        | 2026-09-15 | 9 (Nice, Saint-Laurent-du-Var, Villefranche, Carros), RealHomes      |
| **Forimmo** (forimmo.fr)                                           | 2026-09-15 | 8 (Nice ×3, Cagnes-sur-Mer, Menton), ICS resultat.php                |
| **Nestenn Nice Port - Riquier** (immobilier-nice-port.nestenn.com) | 2026-09-15 | 3 mises en avant sur ~9 : absences sans effet                        |
| **L’Orientation Immobilière** (orimnice.fr)                        | 2026-09-15 | 4 (Nice ×3 dont 1 parking, Le Cannet), ICS neocs                     |
| **Imodirect** (annonces.imodirect.com)                             | 2026-09-15 | 2 (Nice)                                                             |
| **Agence du Port de Nice** (agenceduportdenice.fr)                 | 2026-09-15 | 0 aujourd'hui (suivie en attente), ICS                               |
| **Miramar Real Estate** (miramarimmo.com)                          | 2026-09-15 | 0 aujourd'hui (suivie en attente)                                    |
| **Cabinet Loquis** (loquis.fr)                                     | 2026-09-15 | 0 aujourd'hui (suivie en attente), Crawl-delay 10 s respecté         |
| **Côte d'Azur Properties** (immobilierniceouest.com)               | 2026-09-15 | 0 aujourd'hui (suivie en attente), Houzez                            |
| **CDS Gestion** (cdsgestion.fr)                                    | 2026-09-15 | 0 aujourd'hui (suivie en attente), RealHomes                         |
| **Agence Castel** (agencecastel.com)                               | 2026-09-15 | 0 aujourd'hui (suivie en attente), ancien gabarit Apimo              |
| **CDC Immobilier** (cdcimmobilier.com)                             | 2026-09-15 | 0 aujourd'hui (suivie en attente), ancien gabarit Apimo              |
| **Nicolas Pisani Real Estate** (nicolaspisani.com)                 | 2026-09-15 | 6 (Nice, Beaulieu-sur-Mer, Cap-d'Ail), longue durée seule            |
| **Domi Nice Immobilier** (dominiceimmobilier.com)                  | 2026-09-15 | 0 aujourd'hui (suivie en attente)                                    |
| **BBii** (bbii.fr)                                                 | 2026-09-15 | 0 aujourd'hui (suivie en attente), Twimmo                            |
| **Agence Dumas** (agencedumas.fr)                                  | 2026-09-15 | 4 (Villefranche-sur-Mer, Beaulieu-sur-Mer), parseur dédié            |
| **Cap Sud Immobilier** (capsud-immobilier.fr)                      | 2026-09-15 | 0 aujourd'hui (suivie en attente), Apimo ancien schéma               |
| **Solissimmo** (solissimmo.fr)                                     | 2026-09-15 | 1 (Nice), Apimo ancien schéma                                        |
| **John Taylor** (john-taylor.fr)                                   | 2026-09-15 | 4 (Cagnes-sur-Mer, Vence, Tourrettes-sur-Loup), loyers au mois seuls |
| **BARNES** (barnes-international.com)                              | 2026-09-15 | 0 aujourd'hui (suivie en attente), longue durée seule                |
| **Guy Hoquet** (guy-hoquet.com)                                    | 2026-09-15 | 1 (Nice), pages communes rendues serveur, parseur dédié              |
| **Keller Williams** (kwfrance.com)                                 | 2026-09-15 | 0 aujourd'hui (suivie en attente), Netty                             |
| **Riviera Sud Immobilier** (rsi-immo.com)                          | 2026-09-15 | 3 (Nice), IWS Création, liste seule                                  |
| **Immo Riviera Transactions** (immoriviera.fr)                     | 2026-09-15 | 0 aujourd'hui (suivie en attente), ancien gabarit Apimo « free7 »    |
| **Altarea Gestion Immobilière - Nice** (altarea.flatbay.fr)        | 2026-09-15 | 8 (Nice ×4 dont 1 box, Mougins, Fréjus, Saint-Raphaël), Flatbay      |

## Ce que chaque source donne vraiment (audit du 2026-09-04)

Mesure sur les 989 occurrences actives : **134 portaient des charges, soit
14 %**. L'audit visait à savoir où le manque venait d'un défaut d'extraction, et
où la source ne publie simplement rien.

| Source            | Actives | Charges     | Diagnostic                                                                                                                                                                                                                     |
| ----------------- | ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Famille **Apimo** | ~200    | 0 % → élevé | **Défaut d'extraction, corrigé.** Le bloc « Financier » publie la provision sous un intitulé stable ; on ne le lisait pas.                                                                                                     |
| **studapart**     | 201     | 1 %         | Meublés étudiants, loyer tout compris : il n'y a souvent pas de provision distincte.                                                                                                                                           |
| **email-alerts**  | 199     | 0 %         | Les digests ne portent ni charges ni adresse — limite de la source, pas du parseur.                                                                                                                                            |
| **fnaim**         | 76      | 1 %         | La carte de résultat ne porte ni charges, ni honoraires, ni dépôt, ni DPE, ni disponibilité, et **tronque la description** ; tout cela n'existe que sur la fiche, que le `robots.txt` interdit. Rien à récupérer côté parseur. |
| **dinamy**        | 27      | 0 %         | La fiche ne publie ni charges, ni dépôt, ni honoraires. Rien à récupérer.                                                                                                                                                      |
| **foncia**        | 16      | 0 %         | Application monopage : les données arrivent en JSON embarqué. À creuser.                                                                                                                                                       |

### Le correctif ne rattrape pas le passé

Mesure après la première collecte suivant le correctif Apimo : les fiches
**découvertes depuis** portent toutes leurs charges — Palais Immobilier 8/8,
AKOR 2/2, Ashley Parker 1/1 — tandis que les anciennes restent à zéro : Dazur
0/24, CL Immo 0/16, Agence de la Victoire 0/10.

Ce n'est pas une régression, c'est la conception : le scraper Apimo ne visite
que les fiches NOUVELLES et confirme les connues par le sitemap, sans requête
(§30, §32). Une fiche déjà en base garde donc l'extraction du jour où elle est
entrée.

`pnpm reprocess` ne peut rien y faire non plus : il rejoue l'extraction sur le
texte STOCKÉ, et le bloc de critères n'a jamais été stocké — il n'était pas
extrait. Seul un passage en mode backfill (`pnpm collect -- --backfill`)
re-visiterait ces fiches. Décision à prendre en connaissance du coût : environ
130 requêtes vers des sites d'agences, pour un gain qui viendra de toute façon
au fil du renouvellement des annonces.

Enseignement à garder : un taux à zéro n'est pas forcément un bug. Trois des
quatre sources examinées ne publient pas l'information, et seule la famille
Apimo laissait vraiment passer ce qu'elle affichait.

## Ce que les digests SeLoger rendent (mesure du 2026-09-16)

SeLoger n'est pas collecté : il arrive par les alertes e-mail (`email-alerts`,
préfixe `seloger:`) et par les portails qui le relaient. Voici ce que 338
occurrences en base disent de cette voie.

**Ce qui arrive toujours** : titre, loyer, surface (338/338), nombre de pièces
(334), type de bien (338), une photo (335, toutes sur `mms.seloger.com`),
mention « charges comprises » (308).

**Ce qui n'arrive jamais** : téléphone, e-mail, nom de l'agence, description,
DPE, dépôt de garantie, date de parution, coordonnées GPS — **zéro sur 338**.
L'adresse n'apparaît que 9 fois. Le digest est une vignette, pas une fiche, et
la fiche est derrière le 403 : il n'y a rien à aller chercher.

**Ce qui arrive une fois sur deux** : la commune (208/338) et le code postal
(297/338). La commune manque surtout depuis que les liens ont changé (ci-dessous).

**L'APPORT EST RÉEL ET IL EST EXCLUSIF.** 178 des 338 occurrences sont seules
dans leur groupe : aucune autre source, directe ou portail, ne rend ce logement.
108 autres ne rencontrent que d'autres digests. Seules **52 rejoignent une source
directe** — Bien'ici 31, BEP 9, Foncia 6, Orpi 4, LocService 4, puis une
poignée d'agences. C'est peu, et ce n'est pas faute de chercher : sur les 178
exclusives, 164 ont bien un candidat plausible en source directe (loyer à 6 %
près, surface à 5 %, mêmes pièces, même commune), mais **10 seulement ont un
candidat UNIQUE**. Les autres en ont trois ou quatre, tous différents. Sans
adresse, sans téléphone, sans description et avec une photo réhébergée par
SeLoger — donc partagée avec personne —, il ne reste que des chiffres, et les
chiffres d'un studio niçois ne désignent personne. Élargir le rapprochement
ici ne rapprocherait pas, cela mélangerait (§14).

**LA DÉCOUVERTE N'EST PAS PLUS RAPIDE.** Sur les 77 rapprochements avec une
source directe, SeLoger arrive le premier 36 fois et le second 41 fois. Le
digest n'est pas une longueur d'avance : c'est un gisement à part.

**LE LIEN A CHANGÉ LE 2026-09-14, ET C'EST UNE PERTE.** Jusque-là, le digest
portait l'URL canonique de l'annonce (`www.seloger.com/annonce/26AP3XJCI5FN`),
d'où le parseur tirait une référence stable et la commune. Depuis, il ne porte
plus qu'une redirection opaque `click.by.seloger.com/?qs=…` — un jeton
Salesforce dont seul l'en-tête se décode (`{"v":1,"d":5001}`), le reste étant
chiffré. Conséquences mesurées : 91 occurrences sans référence de portail, dont
la référence est fabriquée depuis le contenu ; 130 sans commune ; et des
DOUBLONS INTERNES, la même annonce revenant sous plusieurs clés
(`21m-620-cc-06300` et `21-m-620-cc-06300`, selon que le digest écrivait
« 21m² » ou « 21 m² »). Suivre la redirection lèverait tout cela — et c'est
exactement ce qu'on ne fera pas : `click.by.seloger.com/robots.txt` répond
`User-agent: * / Disallow: /`. La porte est fermée et elle le dit (§10).

**FIN DE VIE : RIEN DE NEUF À ESPÉRER.** Ces annonces ne disparaissent d'aucune
liste, la fiche est inaccessible (403) et le lien de suivi est interdit : aucune
vérification n'est possible. Restent les deux règles déjà en place, et elles
sont les bonnes — péremption à l'âge pour une source qui n'annonce qu'une fois
(`ONE_SHOT_EXPIRY`, 4 jours de doute, 10 de retrait, comptés depuis la dernière
mention et non la première, ce qui absorbe les renvois), et cycle de vie du
GROUPE aligné sur la source qui se relit quand il y en a une
(`mergeLifecycle`). Pour les 229 fiches que SeLoger porte seul, l'âge reste le
seul juge.

## Agences demandées par leur nom (2026-09-16)

| Demande                                    | Ce que c'est                                                                                                                                                         | Suite                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| « Simma Immobilier »                       | Sima Immobilier, rue de la Buffa à Nice. Elle n'a pas de site à son nom : son site est `fivestarsholidayhouserealestate.com`, sous l'enseigne 5 Stars Holiday House. | Déjà collectée (`five-stars`). Rien à ajouter.           |
| « concept patrimoine immobilier musicien » | Le nom complet de l'agence du quartier des Musiciens de Concept Patrimoine, 28 rue Verdi. Le groupe publie ses trois agences sur une seule page `/locations/`.       | Déjà collectée (`concept-patrimoine`), branche comprise. |

La vraie agence DES Musiciens, elle, manquait : **Agence Gounod**, rue Gounod
depuis 1980, quarante locations dont une quinzaine dans le quartier. Ajoutée.
Autres agences qui s'en réclament, non retenues faute d'y être installées :
HBM Immobilier, Cabinet Vogue, Istra, Immo Terrasse (Savi Esteve, Elitimo et
Winter sont déjà des sources).

## Relecture champ par champ des deux grosses familles (2026-09-16)

Départ : « récupère bien TOUTES les données » de Vizcaya (Apimo) et du Cabinet
AGIR (La Boîte Immo). Fiches ouvertes à la main, colonne par colonne, contre ce
que l'adaptateur en tirait. Les manques trouvés étaient ceux de la PLATEFORME,
donc corrigés une fois pour toutes les agences qui en dépendent.

| Famille                 | Ce que la page publiait sans qu'on le lise                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apimo** (~60 agences) | La **position du bien** (`geo` du JSON-LD) — saisie par l'agence, meilleure qu'un géocodage d'adresse. Le **quartier**, écrit dans le titre de partage (« Location Appartement, Nice Carabacel »). Le **DPE en clair** (`class-d`), plus sûr que l'étiquette dessinée : celle-ci restait affichée vide sur les fiches SANS DPE, et on y lisait une lettre inventée. |
| **La Boîte Immo** (~40) | L'**e-mail de l'agence**, à côté du téléphone du pied de page (la fiche n'offre qu'un formulaire). Les **chambres** et l'**étage**, que seule la table de caractéristiques porte sur plusieurs gabarits. Et « 5 étage(s) », la hauteur de l'IMMEUBLE, qui était prise pour l'étage du logement quand celui-ci n'était pas déclaré.                                  |

Ce qui reste inconnu, faute d'être publié : la date de disponibilité (elle ne
vit que dans le texte, où la normalisation la lit déjà), la rue chez La Boîte
Immo, et le DPE de cette même plateforme — servi en image sous `/admin`, que le
robots.txt interdit. On ne le contourne pas.

## Oqoro, gestionnaire locatif en ligne (étude du 2026-09-16) — implémentée

```
Source            : Oqoro
URL               : https://www.oqoro.com
Type              : agencyNetwork
robots.txt vérifié le : 2026-09-16
Chemins autorisés utilisés : /locations-departement/*, /location/*, /colocation/*
Méthode           : html (rendu côté serveur, Rails/Turbo)
Volume estimé (annonces pertinentes Nice) : 40 fiches dans le périmètre, dont 2 à louer
Fraîcheur (délai de publication constaté) : non mesurable (aucune date publiée)
Difficulté technique : faible
Risque de blocage : faible
Priorité          : 2
```

**Pourquoi on s'y est intéressé.** Oqoro gère des biens POUR des propriétaires
particuliers : on espérait la source de bailleurs privés qui manque au projet.
**Ce n'en est pas une**, et il vaut mieux le dire d'emblée : c'est Oqoro qui
publie (« Publié par OQORO »), Oqoro qui détient la carte professionnelle, et
Oqoro qui facture au locataire des honoraires détaillés — 306,13 € sur la fiche
lue, rédaction du bail et état des lieux compris. Le locataire n'a jamais le
propriétaire en face. Le descripteur porte donc `landlord: 'agency'` : annoncer
« particulier » aurait faussé le filtre qui les cherche.

**Accès.** `robots.txt` (relevé le 2026-09-16) interdit `/recherche?*`,
`/candidat*`, `/proprietaire*`, `/partenaire*`, `/candidature*`, `/*.pdf*` et
`/s/*`. Les listes et les fiches ne sont pas visées. Tout est rendu côté
serveur : aucun appel d'API à imiter, aucun JavaScript nécessaire. Le site
n'envoie ni `ETag` ni `Last-Modified` — il ne répondra jamais 304, et chaque
page est à relire en entier (113 à 470 Ko).

**Le parc est publié EN ENTIER, loué compris.** C'est le fait central. Sur les
quarante-sept biens des Alpes-Maritimes, quarante-quatre portent le bandeau
« Occupé » : ce sont des pages de référencement, pas des offres. Le bandeau de
la carte connaît trois états — « Disponible », « Dispo le 01/10 » (préavis en
cours, avec la date d'entrée) et « Occupé/Occupée » — et le JSON-LD de la fiche
les confirme : `offers.availability` vaut `InStock`, `PreOrder`, ou le bloc
`offers` disparaît. Une fiche occupée n'affiche plus ni loyer, ni honoraires, ni
dépôt.

| Le 2026-09-16                                             | Fiches | À louer |
| --------------------------------------------------------- | ------ | ------- |
| Nice                                                      | 39     | 2       |
| Saint-Laurent-du-Var                                      | 1      | 0       |
| Onze autres communes suivies                              | 0      | 0       |
| Reste du 06 (Cannes, Antibes, Grasse, Mougins, Le Cannet) | 7      | 1       |

Les deux annonces à louer du périmètre sont deux chambres d'une même colocation
niçoise. C'est peu, et c'est assumé : la source coûte trois pages par passage.

**Entrée départementale, pas communale.** Chaque commune de France a sa page
(`/locations/contes` existe et annonce « 0 appartements »), et le titre y donne
un total qui prouverait l'exhaustivité — mais lire les treize communes suivies
coûtait treize pages sans cache à chaque passage. La liste
`/locations-departement/alpes-maritimes` porte exactement les mêmes annonces en
trois pages de vingt (39 fiches niçoises des deux côtés, vérifiées une à une),
et fera apparaître d'elle-même une commune où Oqoro n'a encore rien. On filtre
sur les communes du périmètre (`portalCommunes`), et l'on s'arrête à la première
page incomplète — la quatrième est vide.

**Ce que publie une fiche**, et c'est riche : adresse EXACTE avec le numéro (la
carte la porte déjà, dans l'`aria-label` de la photo), position géographique
saisie par le gestionnaire, code postal, loyer charges comprises, provision sur
charges avec son détail (ordures ménagères, eau, chauffage, internet…), dépôt de
garantie, honoraires ventilés, surface — et la part PRIVATIVE pour une chambre
en colocation —, nombre de chambres, étage, meublé ou non, commodités, DPE **et**
GES chiffrés chacun sur son échelle, description longue avec le quartier en
toutes lettres, référence interne (`OQ6686W`), galerie de photos et visite
virtuelle Matterport.

**Ce qu'elle ne publie pas : aucune coordonnée.** Ni téléphone, ni e-mail. Le
seul canal est le bouton « Candidater », qui mène à
`/candidat/applications/new?lot=…` — chemin que le `robots.txt` interdit, et qui
demande un compte. On ne le remplit donc pas, et `contactFormUrl` reste vide
plutôt que de faire croire à un canal automatisable : l'utilisateur clique
lui-même depuis la fiche.

**Ce qu'on y gagne en plus des annonces.** Le bandeau « Occupé » est un signal
de location POSITIF, que presque aucune source ne donne : une annonce déjà
publiée qui passe à « Occupé » est rendue louée dans le passage même
(`rentedRefs`), sans attendre trois absences.

## Les annonces de DEMANDE (audit du 2026-09-16)

Des particuliers publient l'annonce inverse : non pas « je loue », mais « je
cherche ». Elle n'a rien d'une offre — le loyer affiché est leur budget, la
surface leur souhait, et la contacter ne mène à aucun logement.

**Ce que publie ParuVendu.** Le site a bien une rubrique de demandes —
`/immobilier/demande-de-location/`, « Recherche de logement à louer : annonces
de locataires », cinq pages de trente, une déclinaison par ville, que le menu ne
montre nulle part et que le `robots.txt` n'interdit pas. Mais **c'est un espace
de dépôt séparé**, et c'est ce qui décide de tout :

|                  | rubrique des demandes                                                                 | les cinq trouvées en base               |
| ---------------- | ------------------------------------------------------------------------------------- | --------------------------------------- |
| code de rubrique | `IDELO000`, `type=avisrecherche`                                                      | `ILHAP000` — celui d'une offre          |
| fiche            | aucune : une popin sous `/communfo/popincommunfo/`, **interdite** par le `robots.txt` | `/immobilier/location/appartement/<id>` |
| identifiants     | 159 relevés le 2026-09-16                                                             | **aucun en commun** avec nos 221 offres |

Autrement dit, une annonce déposée dans la rubrique des demandes n'en sort
jamais ; les cinq qui nous sont arrivées avaient été déposées **par leur auteur
dans la rubrique des offres**. Leur fiche est alors celle d'une offre jusqu'au
dernier octet : même `codeRubrique`, même fil d'Ariane JSON-LD, six photos,
référence `WI…` de particulier — le préfixe des dépôts de particuliers, offres
comprises. **Aucun marqueur structurel, ni en liste, ni en fiche.**

Reste le texte, et il se lit dès la carte : l'extrait de description
(`p.line-clamp-5`) commence par l'intitulé qu'a écrit le déposant (« Retraitee
du corps medical cherche studio t1. urgent… »), avant le corps de l'annonce.
Cinq demandes étaient en base le 2026-09-16, dont trois passaient les critères
et deux ont été notifiées.

**Pourquoi on ne lit PAS la rubrique des demandes à chaque passage.** Elle
donnerait une liste d'identifiants à exclure d'office — un signal déterministe,
bien préférable à du texte. Sauf qu'elle ne croise rien : zéro identifiant
commun sur 159 × 221, et aucune des cinq n'y figurait. Cinq pages par passage
pour une liste qui, par construction, ne désigne jamais une annonce que nous
collectons. Elle a servi de corpus d'essai, pas de garde-fou.

**Les autres sources.** Vérification faite sur les 4 993 occurrences en base et
sur les points d'entrée de chaque source : **aucune autre n'en apporte**.

- **LocService** — son `robots.txt` ferme l'espace où les locataires déposent
  leur recherche (`Disallow: /locataires/consulter/`, `/locataires/match-*`) ;
  nous ne lisons que les pages de commune, qui sont des offres. Attention : le
  site rédige ses offres à la première personne — « Je cherche un locataire
  pour un studio de 22 m² », « Recherche locataire pour chambre meublée ». Ce
  sont des OFFRES, et six d'entre elles sont en base.
- **Studapart** — l'API ne rend que des biens ; sa prose s'adresse au lecteur
  (« You are looking for a shared apartment », « PROFIL RECHERCHÉ »).
- **Bien'ici, FNAIM, Figaro Immo, alertes e-mail, Rentumo** — inventaires
  professionnels ou relais d'offres, sans dépôt par des particuliers.
- **PAP** — désactivée ; ses points d'entrée sont de toute façon des listes
  d'offres (`/annonce/locations-nice-06-g8979`).
- Les ~200 agences publient leur propre stock.

**La règle** (`normalization/housing-wanted.ts`). Une demande se reconnaît à un
**verbe de recherche conjugué dont l'objet immédiat est un logement** —
« cherche studio », « je recherche un appartement », « recherche 3 pièces » —
lu dans le titre et les 400 premiers caractères de la description ; et, **en
tête de l'intitulé seulement**, à un demandeur qui se présente (« Couple
recherche », « Retraité recherche »). Tout le reste passe :

| Ce qui ressemble à une demande                                          | Pourquoi ce n'en est pas une           |
| ----------------------------------------------------------------------- | -------------------------------------- |
| « Je cherche un **locataire** pour un studio »                          | l'objet du verbe est une personne      |
| « secteur très **recherché** »                                          | l'adjectif, que l'accent perdu confond |
| « **vous êtes à la** recherche d'un appartement »                       | le nom, précédé d'un déterminant       |
| « **votre** demande de location »                                       | idem                                   |
| « **PROFIL** RECHERCHÉ : colocation calme »                             | idem                                   |
| « **notre agence** recherche des appartements pour ses clients »        | la prospection d'un professionnel      |
| « le propriétaire, un **couple** retraité, **recherche** un locataire » | le demandeur n'est reconnu qu'en tête  |

**Écarter une vraie offre est plus grave que laisser passer une demande**, et
la règle est réglée dessus :

- **elle n'exclut que là où des demandes se publient** — le drapeau
  `hostsWantedAds` du descripteur, vrai pour ParuVendu seul. Ailleurs, une
  formulation de demande est **signalée dans le journal sans retirer
  l'annonce** : une agence ne publie pas la recherche d'un locataire, et lui
  appliquer la règle ne ferait courir qu'un risque ;
- **rien ne disparaît en silence** : chaque annonce reconnue est nommée dans le
  journal de collecte avec son identifiant, son adresse et **la phrase qui l'a
  désignée** (`listing.wanted_ad_dropped` / `listing.wanted_ad_seen`, et
  `demande.ecartee` côté ParuVendu, avant même la lecture de la fiche) ;
- **`pnpm audit:data` la repasse sur toute la base** et liste ce qu'elle
  reconnaît, pour qu'on puisse relire ligne à ligne.

**Mesure du 2026-09-16, sur deux corpus étiquetés** — les 159 demandes de la
rubrique dédiée plus les 5 retrouvées en base, contre les 4 999 occurrences
stockées :

|                                                        | avant         | après         |
| ------------------------------------------------------ | ------------- | ------------- |
| offres écartées à tort (sur 4 999)                     | **0**         | **0**         |
| demandes reconnues, rubrique entière                   | 78/159 (49 %) | 83/159 (52 %) |
| demandes reconnues, celles qui portent sur un logement | 78/107 (73 %) | 81/107 (76 %) |
| les cinq mal classées, réelles                         | 5/5           | 5/5           |

Le rappel plafonne, et ce n'est pas un défaut de la règle : la moitié des
intitulés de la rubrique ne dit rien qu'une offre ne dirait — « Maison »,
« T 2 vide », « Appartement 3 pièces », « Urgent », « Recherche » — et l'autre
moitié des ratés ne parle pas de logement du tout (garage, terrain, camping-car,
salle des fêtes). Les reconnaître coûterait de vraies annonces.

## Descriptions complètes (relevé du 2026-09-14)

Mesure par source de la description stockée : absente, ou coupée à une
longueur fixe. Les lignes du tableau plus haut qui disent « pas de visite de
fiche » ou « seules les fiches nouvelles » sont dépassées pour ces sources.

| Source            | Avant                             | Correctif                                                               |
| ----------------- | --------------------------------- | ----------------------------------------------------------------------- |
| Laforêt           | aucune (31 annonces)              | fiche, `#section-description .prose`, ≤ 6 par passage                   |
| Dinamy            | aucune (27)                       | fiches jamais relues : `enrichNewListings`, photos et DPE en prime      |
| Winter            | aucune (8)                        | fiche, `.readmore__content`, ≤ 10 par passage                           |
| Borne & Delaunay  | aucune (3)                        | fiche, `.accommodation-show__text`, ≤ 5 par passage                     |
| Agence du Centre  | aucune (6)                        | gabarit éditorial Hektor (`.editorial__text`), commun avec Aurus        |
| Pujol             | JSON-LD coupé à 500, `<BR>` bruts | corps de la fiche (`.annonce-desc`)                                     |
| Votre Agence Immo | meta description, 160 caractères  | `p.description-bien`                                                    |
| Arthurimmo        | en-tête coupé à ~150 « … »        | bloc `[x-ref="content"]` ; `runListAndDetails` ; DPE du badge `letter=` |
| L'Adresse         | « 3 pièces, 2 chambres 76.25 m² » | fiche, `#annonce-description`, ≤ 10 par passage                         |
| Rentumo           | accroche de 58 caractères         | **non fait** : le texte est derrière l'inscription obligatoire          |

Les fiches déjà en base sans description sont revisitées d'elles-mêmes (cinq
par source et par passage). Colocation et bail étudiant : aucune annonce dont
le texte dit « en colocation », « bail étudiant » ou « bail mobilité » n'était
restée sans son badge.

## Ordre d'implémentation recommandé

1. **Laforêt** — fait. Sert de source pilote et de référence d'architecture.
2. **Orpi** — fait (2026-08-15). Première source avec GPS : signal de
   dédoublonnage très fort.
3. **BEP Logement** — fait (2026-08-15). Première agence locale et première
   source `sitemap` ; les deux modes de collecte du core sont validés.
4. **Foncia** — fait (2026-08-15). Adresse complète dans les cartes.
5. **PAP** — implémentée mais désactivée (WAF anti-client-HTTP, voir tableau).
6. **Adaptateurs d'agences locales** (Apimo/Cello, Ubiflow, Hektor…) — le
   parser BEP est le premier candidat à généraliser (§47) ; prochain chantier
   le plus rentable.

## Ne pas réinventer : ce qui existe déjà (revue du 2026-09-10)

Question posée : d'autres ont forcément écrit ce collecteur avant nous — que
peut-on reprendre ? Revue de l'open source français et des API commerciales.

**Réponse courte : rien de réutilisable, et pour une raison précise.**

### L'open source français : tout vise les portails, tout est mort

| Projet                       | Cible                           | État                           |
| ---------------------------- | ------------------------------- | ------------------------------ |
| `0x6e69636f/api-sites-immo`  | Leboncoin, SeLoger, PAP, Logic  | Python, sans licence, ~2020    |
| `Fluximmo/api-immo-scrapper` | Leboncoin, PAP, MeilleursAgents | Scrapy, dernière activité 2020 |
| `MisterDaneel/condowatcher`  | Leboncoin, SeLoger, PAP         | archivé par son auteur         |
| `ix-56h/Scrapart`            | Leboncoin, SeLoger, PAP         | abandonné                      |
| `mc343/FrenchRentalScanner`  | SeLoger, Leboncoin              | vivant (2026), mais 2 étoiles  |
| `immosheets`                 | portails → Google Sheets        | vivant (2025), 46 étoiles      |

Deux constats.

**Ils visent les portails que ce projet s'interdit.** Leboncoin et SeLoger sont
protégés par DataDome et interdisent explicitement l'accès automatisé. Ces
dépôts contournent — en rejouant les requêtes des applications mobiles, pour la
plupart. C'est précisément ce que nous ne faisons pas, et cela suffit à écarter
la totalité du catalogue. (Bien'ici figurait ici : son verdict a été levé, voir
sa fiche plus haut — son API de recherche est publique.)

**Ils meurent tous, et c'est la conséquence directe.** Un scraper qui contourne
une protection vit jusqu'à la prochaine mise à jour de cette protection.
Six des huit dépôts trouvés n'ont plus bougé depuis 2020-2023. Notre stratégie
inverse — deux cent dix petites sources qui nous autorisent — coûte plus cher
à écrire et ne casse pas toute seule.

### Les API commerciales : elles vendent ce que nous ne payons pas

MoteurImmo, Melo, Fluximmo v2, Stream Estate agrègent 1 500 sources et vendent
l'accès (Melo à partir de 24 €/mois, MoteurImmo au volume). Techniquement
excellent, et sans objet ici : le projet tient dans les paliers gratuits, et son
modèle est justement de ne pas payer la matière première.

À noter tout de même : elles revendent en grande partie du contenu Leboncoin et
SeLoger. Elles déplacent la question de conformité, elles ne la résolvent pas.

### La question était mal posée (correction du 2026-09-10)

La revue ci-dessus cherchait des SCRAPERS à reprendre, et sa conclusion tient.
Mais elle passait à côté de l'autre moitié : les **données publiques gratuites**,
qui ne se scrapent pas et s'interrogent par API, sans clé et sans limite.

**Ce qui est directement exploitable :**

| Jeu                              | Ce qu'il apporte                                                  | Accès                          |
| -------------------------------- | ----------------------------------------------------------------- | ------------------------------ |
| **DPE ADEME** (`dpe03existant`)  | Étiquette DPE et GES, surface, année de construction, à l'adresse | API libre, 15,5 M de lignes    |
| **Carte des loyers** (DHUP/ANIL) | Loyer d'annonce au m² par commune et par taille                   | CSV annuel — **déjà en place** |
| **API Adresse (BAN)**            | Normalisation et géocodage d'adresse                              | API libre — **déjà en place**  |
| **Géorisques**                   | Risques à l'adresse (inondation, retrait-gonflement…)             | API libre                      |
| **DVF**                          | Prix de VENTE réels — sans objet pour la location                 | API libre                      |

**Le DPE de l'ADEME est le gisement.** 15 630 diagnostics pour le seul code
postal 06200, avec l'adresse normalisée BAN, la surface habitable et l'année de
construction. Or sur les 2 708 occurrences actives, **589 seulement portent un
DPE** — alors qu'il est obligatoire dans une annonce de location depuis 2021.
Six cents annonces ont une adresse de rue et pas de DPE.

Mesure d'appariement du 2026-09-10, sur un échantillon de 18 annonces avec
adresse et surface, appariement naïf (texte + surface à ±2 m²) : **8 retrouvées**.
Un appariement passant d'abord par la BAN ferait nettement mieux.

Trois usages, par ordre d'intérêt :

1. **Combler le DPE manquant** — un critère de recherche à part entière, et une
   information légalement due que la moitié des sources ne publie pas.
2. **L'année de construction** — jamais publiée par aucune source, et elle dit
   beaucoup des charges et de l'isolation.
3. **Contredire une surface annoncée** — le DPE mesure la surface habitable à la
   même adresse. Deux valeurs qui divergent de dix pour cent méritent un signal.

### Ce qui, en revanche, se reprend — et qu'on a déjà repris

Les adaptateurs de LOGICIELS D'AGENCE. Apimo, La Boîte Immo/Hektor, Ubiflow
équipent des milliers d'agences avec le même gabarit : un parser sert des
dizaines de sites. C'est le vrai levier, et le projet l'exploite déjà — c'est ce
qui explique une bonne part des deux cent dix sources.

**Piste non explorée** : les flux XML que ces logiciels exposent pour les
portails (format Poliris/Ubiflow, `poliris-bundle` en donne le schéma). Une
agence peut ouvrir le sien sur demande. Zéro parsing, zéro casse, mais une
démarche humaine par agence — à tenter sur les trois ou quatre qui comptent.

## Cot'Ouest Immobilier (étude du 2026-09-16) — implémentée

```
Source            : Cot'Ouest Immobilier
URL               : https://www.cotouest-immobilier.com
Type              : localAgency
robots.txt vérifié le : 2026-09-16
Chemins autorisés utilisés : /toutes-locations.html, /*.html
Méthode           : html
Volume estimé (annonces pertinentes Nice) : 2
Fraîcheur         : non datée par le site
Difficulté technique : faible (plateforme Twimmo déjà outillée)
Risque de blocage : faible
Priorité          : 2
```

Groupe de trois agences de Nice ouest — Californie / Promenade des Anglais,
Napoléon III / Fabron, Cagnes-sur-Mer — qui publient leur parc sur un seul site,
au 203 avenue de la Californie. À ne pas confondre avec **Agence Californie**
(`agencecalifornie.fr`), voisine d'adresse et déjà collectée, ni avec le
**Groupe Cot'Ouest** tel que les annuaires (FNAIM, SeLoger, Bien'ici) le
republient : le site de l'agence fait foi.

**Le robots.txt n'interdit rien à notre collecteur.** Il n'a aucune règle
`User-agent: *` ; il ne nomme que des aspirateurs de sites, chacun avec son
`Disallow: /` — `HTTrack`, `WebZIP`, `Teleport`, `TeleportPro`, `WebCopier`,
`WebStripper`, `SiteSnagger`, `Offline Explorer`, `Xenu`, `wget`, `libwww`,
`Scrapy`, `Nutch`, `larbin`, `WebReaper`… — et autorise explicitement Googlebot
et les robots publicitaires. Le sitemap y est déclaré. Notre user-agent n'est
aucun de ceux-là, et la collecte reste à une page de liste plus les fiches
nouvelles, espacées comme partout ailleurs.

**Plateforme : Twimmo**, reconnue à `medias.twimmopro.com` dès le `<head>`, et
signée en pied de page. Aucun parseur à écrire pour la liste : `/toutes-locations.html`
et la référence en fin d'adresse de fiche sont celles de la famille.

**Mais l'habillage n'est pas celui de MK Immo ni d'Elitimo.** Twimmo sert
plusieurs gabarits, et celui-ci (`_templateC`) déplace trois choses :

| Ce que le parseur de famille cherche | Où templateC le met                                    |
| ------------------------------------ | ------------------------------------------------------ |
| `.detail-header-titre` (ville + CP)  | nulle part — le CP ne vit que dans la méta description |
| `.detail-offre-texte` (description)  | `.offer-description-description`                       |
| « Classe climat (ges) »              | « Emission de gaz à effet de serre (ges) »             |

Les montants, eux, sont aux mêmes phrases engendrées, et le négociateur au même
encadré : `parseTwimmoDetail` est donc APPELÉ, pas recopié, et
`sources/cot-ouest/parser.ts` ne remplit que les trois manques. Ces compléments
valent pour tout site en templateC et ont vocation à rejoindre `twimmo/parser.ts`.

**La liste en dit plus que la fiche.** Chaque carte porte en attributs `data-*`
la commune, le quartier et la position GPS saisie par l'agence — que la fiche ne
publie nulle part, sans JSON-LD ni microdonnées. On les prend là. Son loyer,
en revanche, est laissé de côté à dessein : `runListAndDetails` rend toute
annonce qui en porte un, et la carte en affiche un pour les saisonnières.

**3 locations publiées, 2 dans le périmètre** (Nice 06200 : un 2 pièces bail
étudiant 9 mois, un 3 pièces meublé Corniche Fleurie). La troisième est une
location à la semaine à Lecci (Corse) : sa fiche n'a pas de « Loyer mensuel »,
le parseur la refuse, et la carte l'annonçait « Prix sur demande ».

## Fiche à remplir pour toute nouvelle source

```
Source            :
URL               :
Type              : portal | agencyNetwork | localAgency | aggregator
robots.txt vérifié le :
Chemins autorisés utilisés :
Méthode           : officialApi | rssFeed | sitemap | html
Volume estimé (annonces pertinentes Nice) :
Fraîcheur (délai de publication constaté) :
Difficulté technique :
Risque de blocage :
Priorité          :
```

## Vingt-trois candidats passés au crible (balayage du 2026-09-16) — aucun retenu

Quatre familles demandées par l'utilisateur : mise en relation inversée,
agrégateurs, petites annonces généralistes, étudiant et moyenne durée. Chaque
ligne a été vérifiée le 2026-09-16 avec le user-agent du collecteur
(`MaiounBot/0.1`), requêtes espacées de 3 s, `robots.txt` lu d'abord. **Aucun
candidat n'est retenu** : la moitié n'existe plus, le reste est soit fermé par
`robots.txt`, soit sans une seule annonce dans le périmètre, soit du meublé de
courte durée facturé à la nuitée.

**Aucun n'a été écarté pour « pas assez de particuliers »** : le critère élargi
du 2026-09-16 — un portail mixte particuliers/agences reste bon à prendre — ne
récupère aucun de ces vingt-trois, chacun butant sur un obstacle antérieur.

### Mise en relation inversée : le service marche à l'envers, et surtout il n'existe plus

Ces plateformes renversent le sens habituel : le candidat dépose son dossier et
ce sont les propriétaires qui le contactent. Il n'y a donc **rien à collecter**,
par construction. Et de fait, quatre des cinq ont fermé.

| Source                      | Vérifié    | Verdict                                    | Preuve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ---------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Locat'me** (locatme.fr)   | 2026-09-16 | 🔴 Site fermé                              | Le domaine résout vers `213.186.33.5`, l'IP de parking d'OVH ; HTTPS répond `Connection reset`, HTTP rend la page `<title>Site en construction</title>` d'OVHcloud, en `noindex,nofollow`. Il n'y a plus de service.                                                                                                                                                                                                                                                                                                                            |
| **Somhome** (somhome.com)   | 2026-09-16 | 🔴 Domaine éteint                          | Plus aucun enregistrement DNS A, ni sur `somhome.com` ni sur `www.somhome.com` (`Could not resolve host`). `somhome.fr` n'existe pas non plus.                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Wizi** (wizi.io)          | 2026-09-16 | 🔴 Aucune annonce sur le web               | Attention à l'homonyme : `wizi.fr` redirige vers `vosdomaines.com` (domaine à vendre, 403). Le vrai service est `wizi.io`, dont le `robots.txt` est ouvert (`Disallow:` vide) — mais son `sitemap.xml` ne contient que **432 URL, toutes éditoriales** (blog, pages produit, mentions légales) : zéro page d'annonce. Les annonces ne vivent que dans l'application mobile.                                                                                                                                                                     |
| **Qasa** (qasa.com)         | 2026-09-16 | 🔴 Hors périmètre géographique             | `robots.txt` ouvert (`Allow: /`) et sitemap déclaré. Mais `sitemaps/home-search/sitemap.xml` ne contient que **3 318 URL réparties sur `/se/`, `/no/` et `/fi/`** — Suède, Norvège, Finlande, 1 106 chacune. Zéro URL française ; aucune occurrence de « nice » ni de « france ». Qasa a quitté la France.                                                                                                                                                                                                                                      |
| **123Loger** (123loger.com) | 2026-09-16 | ✅ **Corrigé le 2026-09-22 — implémentée** | Verdict d'époque : `robots.txt` permissif (seuls `/search/`, `/feed/`, `/go/`, `/wp-admin/` fermés), sitemap gzip de 1 525 URL couvrant **215 communes, aucune dans le 06**. **LE SITEMAP MENTAIT PAR OMISSION** : une annonce niçoise reçue par e-mail (`/location/nice-06000/appartement/6791fe67020c/`) a montré que les pages existent sans y être listées. Le verdict reposait sur une seule preuve, et l'absence au sitemap n'est pas l'absence au site. La source lit désormais `/location/nice-06000/appartement/`, 13 pages publiques. |

**Ce que l'utilisateur gagnerait à faire lui-même** : de ces cinq, seul **Wizi**
(wizi.io) est encore vivant et gratuit pour les particuliers. Comme il n'expose
rien sur le web, s'y inscrire depuis l'application est la seule façon d'en
profiter — et cela reste marginal, le service étant surtout un outil de gestion
locative pour le bailleur, pas un vivier d'annonces.

### Agrégateurs : rien d'exclusif, quand il y a quelque chose

| Source                       | Vérifié    | Verdict                            | Preuve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ---------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Jinka** (jinka.fr)         | 2026-09-16 | 🟠 Inchangé : par e-mail seulement | Nouvelle vérification, même constat qu'au 2026-09-04 : `sitemap.xml` répond **404**, l'accueil porte `<meta name="robots" content="noindex">`, et `/alerts` redirige vers `/sign/in?return_to=%2Falerts` — page que `robots.txt` interdit (`Disallow: /sign/*`). Toujours aucune page publique d'annonces. La voie conforme reste l'import d'un digest, et il manque toujours **un vrai e-mail d'alerte Jinka** pour en lire la structure.                                                 |
| **Louervite** (louervite.fr) | 2026-09-16 | 🔴 Serveur injoignable             | Le domaine résout (`217.151.0.171`) mais rien n'écoute : délai dépassé sur le port 443 **comme sur le port 80**. Aucune variante `.com` ne résout.                                                                                                                                                                                                                                                                                                                                         |
| **Castorus** (castorus.com)  | 2026-09-16 | 🔴 Ne traite pas la location       | `robots.txt` accueillant (groupe `ClaudeBot` avec `Crawl-delay: 10`, `Allow: /llms.txt`). Le site **publie sa propre description à destination des IA** : `llms.txt` et `llms-full.txt` (12 153 octets) parlent historique des prix, baisses, statistiques au m², ventes DVF — et ne contiennent **aucune occurrence de « location », « louer » ou « loyer »**. `/annonces/nouveautes` confirme : menus « Prix & Tendances », « Ventes DVF », « Rentabilité ». Castorus suit la **vente**. |

### Petites annonces généralistes et régionales : huit fausses pistes

| Source                                            | Vérifié    | Verdict                            | Preuve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------- | ---------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Petites-annonces.fr** et **PetitesAnnonces.fr** | 2026-09-16 | 🔴 Déjà collecté sous un autre nom | Les deux domaines pointent la même IP (`51.91.60.233`) et **redirigent tous les deux vers `https://www.paruvendu.fr/`**. Ce sont des noms de domaine de ParuVendu, source **déjà implémentée le 2026-09-11**. Apport exclusif nul par construction.                                                                                                                                                                                                                                                      |
| **Marche.fr**                                     | 2026-09-16 | 🔴 Fermée par `robots.txt`         | Le groupe `User-agent: *` interdit précisément ce qu'on voudrait lire : `Disallow: /annonces/` **et** `Disallow: /petites-annonces/`. Accès non conforme (§10). Le site affiche par ailleurs ses erreurs PHP (`Constant MARCHE_DATABASE_HOST already defined`) et un bandeau « ce site et le nom de domaine sont à vendre ».                                                                                                                                                                             |
| **Annoncesjaunes.fr**                             | 2026-09-16 | 🔴 Coquille vide                   | Le domaine résout vers `165.160.13.20` (parking Verisign) ; HTTPS ne répond pas, HTTP rend **94 octets** : `<html><head><title></title>…<body></body></html>`. Aucun contenu.                                                                                                                                                                                                                                                                                                                            |
| **LesParticuliers.fr**                            | 2026-09-16 | 🔴 Serveur injoignable             | Résout vers `137.74.219.48` mais rien n'écoute, ni en 443 ni en 80. `lesparticuliers.com` et `.net` pointent `217.151.2.5` et ne répondent pas davantage.                                                                                                                                                                                                                                                                                                                                                |
| **Annonces-de-france**                            | 2026-09-16 | 🔴 Domaine inexistant              | Aucun enregistrement DNS A sur `annonces-de-france.com`, `annonces-de-france.fr`, `annoncesdefrance.com` ni `annonce-de-france.fr`. `annoncesdefrance.fr` résout (`3.33.139.32`) mais ne répond pas sur 443.                                                                                                                                                                                                                                                                                             |
| **Webmycar**                                      | 2026-09-16 | 🔴 Site en construction            | `webmycar.fr` résout vers l'IP de parking OVH `213.186.33.5` et rend la page « Site en construction ». `webmycar.com` et `.net` n'ont pas d'enregistrement A. Le nom annonçait de toute façon de l'automobile, pas du logement.                                                                                                                                                                                                                                                                          |
| **Nice-Matin, petites annonces**                  | 2026-09-16 | 🔴 Pas d'annonces immobilières     | `robots.txt` (version 8, publiée le 2026-08-12) laisse le groupe `*` passer avec `Crawl-delay: 10`. Mais **`/petites-annonces` redirige vers `/annonces-legales`**, et le menu « Annonces » du site ne propose que : avis de décès, annonces légales, marchés publics (sous-traités à `francemarches.com`) et emploi. `/annonces` répond 404 ; `immobilier.nicematin.com` et `petites-annonces.nicematin.com` ne résolvent pas. Les petites annonces immobilières du journal sont restées sur le papier. |

### Étudiant et moyenne durée : de l'archive, des résidences, et de la nuitée

| Source                                    | Vérifié    | Verdict                                    | Preuve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ---------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Etuloge** (etuloge.fr)                  | 2026-09-16 | 🔴 Inventaire mort, et vide de champs      | `robots.txt` ferme `/property/*`, `/search/*` et `/api/`, mais laisse `/annonce/*` et `/logement-etudiant/*`. Deux obstacles, chacun rédhibitoire. **(1)** Le site est une application Bubble : `/logement-etudiant/nice` est une coquille de 6 712 octets, zéro lien d'annonce ; les fiches `/annonce/<slug>` ne portent que titre, loyer et une photo — ni surface, ni pièces, ni contact, ni JSON-LD. **(2)** Le `sitemap-annonce.xml` aligne 4 777 URL **sans un seul `<lastmod>`** : rien ne distingue le vivant du périmé. Sondage de quatre annonces niçoises : les quatre photos datent du **4 novembre 2019**. C'est une archive, pas un inventaire.                                   |
| **Adele** (adele.org)                     | 2026-09-16 | 🔴 Annuaire de résidences, pas d'annonces  | `robots.txt` ouvert, sitemaps complets, pages en rendu serveur avec JSON-LD propre (adresse postale, coordonnées GPS). Mais l'objet publié est la **résidence**, pas le logement : `/residence/agglomeration/nice/logement-etudiant` annonce « 2 130 places » réparties sur une vingtaine de résidences d'exploitants professionnels (Nexity Studéa, Odalys Campus, Les Estudines, Student Factory, CROUS). Aucune fiche ne porte de loyer, et la fiche Studéa Riquier répond « Les disponibilités ne sont pas encore ouvertes pour la période demandée ». Rien à transformer en annonce.                                                                                                       |
| **Erasmusu** (erasmusu.com)               | 2026-09-16 | 🔴 Courte durée, contact payant            | `robots.txt` permissif (`Allow: /`, seule la pagination `?p=` est fermée) et `/fr/logement-etudiant/nice` rend **23 annonces en clair** : quartier, type, loyer mensuel, date de disponibilité, charges comprises ou non. Deux raisons de ne pas la prendre. **(1)** L'inventaire est celui de **Spotahome** — les fiches affichent « propriété vérifiée par Spotahome » et « Spotahome PLUS ». **(2)** Le contact n'existe pas : « Informations sur le propriétaire » est masqué, et le seul bouton est « Voulez-vous effectuer une réservation ? ». Meublé de séjour réservé et payé sur la plateforme, pas une location à l'année.                                                           |
| **HousingAnywhere** (housinganywhere.com) | 2026-09-16 | 🔴 Loyer à la nuitée, et 8 fiches lisibles | `robots.txt` ferme `/api/*` et la recherche à paramètres. `/s/Nice--France` annonce **321 logements** (JSON-LD `offerCount: 321`, de 300 à 2 268 €) mais n'en rend que **8 côté serveur** : pas de `rel="next"`, pas de `__NEXT_DATA__`, et le sitemap `sitemap-en.xml` (11 575 URL) ne contient **aucune URL `/room/`** — seulement des pages ville et pays. Les 313 autres ne s'obtiennent que par l'API interdite. Et ce qu'on y lirait n'est pas ce qu'on cherche : la fiche `ut1730696` (bd Stalingrad, 45 m², 1 550 €) explique que « This listing's rent is calculated on a daily basis […] just like a hotel », avec annulation flexible et « Tenant Protection fee » non remboursable. |
| **Coliving.com**                          | 2026-09-16 | 🔴 Une seule adresse, hors périmètre       | `robots.txt` ouvert. Mais `coliving.com/france/nice` **redirige vers `/france`**, et la page `/nice` est rendue par Alpine.js côté client (gabarits `x-for` vides en HTML). Le seul bien de la zone visible en rendu serveur est **« The Cabots », à Biot** — commune absente du périmètre des treize. Le filtre de la page ne propose que « Biot » et « Nice Center ».                                                                                                                                                                                                                                                                                                                         |
| **Flatlooker** (flatlooker.com)           | 2026-09-16 | 🔴 N'existe plus : absorbé par Manda       | `https://www.flatlooker.com/` renvoie une **301 vers `https://www.manda.fr/`** ; toute URL d'annonce Flatlooker aboutit en 404 sur manda.fr. Le candidat se confond désormais avec Manda.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Manda** (manda.fr)                      | 2026-09-16 | 🔴 Locations fermées par `robots.txt`      | Confirme l'étude du 2026-08-15, fusion Flatlooker comprise. `robots.txt` interdit `/location-immobiliere?*` **et** `/location-immobiliere.json` : la recherche et son flux sont l'un et l'autre hors d'accès conforme. La page `/location-immobiliere` sans paramètre est une coquille JavaScript — **zéro occurrence de « Nice »**. Et le `sitemap-public.xml` (2 760 URL) ne contient aucune annonce de location : 1 150 pages `service-gestion-locative`, 224 `agence-immobiliere`, 158 `annonces-vente-immobiliere` — **la vente seule est publiée**.                                                                                                                                       |

### Bien'ici : le champ « type d'annonceur » marche, les particuliers n'existent pas (mesure du 2026-09-16)

Vérification demandée : le flux expose-t-il le type d'annonceur, et peut-on
isoler les particuliers ? **Le champ marche ; il n'y a simplement personne
derrière.** Relevé de l'inventaire niçois entier ce jour, six pages de cent sur
`realEstateAds.json` (`filterType: rent`, `onTheMarket: [true]`, zone
`-170100`) : le portail annonce **554 locations**, les 554 ont été lues, et
`accountType` se répartit en **519 `agency`, 29 `network`, 6 `mandatary`** —
soit 554 professionnels et **zéro particulier**. Aucune fiche ne laisse le champ
vide. Le constat des 1 100 fiches précédentes est donc **confirmé**, sur
l'inventaire complet cette fois.

Le champ n'est pas décoratif pour autant : il distingue bien quatre natures de
compte, et la même requête en `filterType: buy` en fait apparaître une
cinquième — sur 4 960 annonces de vente, les cent premières donnent 83
`agency`, 11 `mandatary`, 5 `network` et 1 `developer`. C'est l'offre niçoise de
Bien'ici qui est intégralement professionnelle, pas la lecture qu'on en fait.

**Il n'existe pas de filtre « particulier » à passer à l'API.** Les deux
paramètres plausibles ont été essayés : `isPrivateSeller: true` et
`accountTypes: ["individual"]` laissent l'un et l'autre le total à **554**,
inchangé — l'API ignore silencieusement ce qu'elle ne connaît pas, et ce total
identique est la preuve que le filtre n'a pas mordu. La page de recherche
publique `/recherche/location/nice-06000` (autorisée par `robots.txt`) ne
contient elle non plus aucune occurrence de « particulier » : c'est une coquille
de 5 517 octets.

Conclusion : `PRO_ACCOUNTS` dans `sources/bienici/parser.ts` reste juste, et la
branche `private` du parseur restera inutilisée tant que le portail n'aura pas
d'offre de particuliers à Nice. **Rien à changer dans le code.**

### SeLoger : pas de nouvelle tentative

Le verdict du 2026-09-16 (403 DataDome) n'a pas été retesté, conformément à la
consigne. Seul `robots.txt` a été relu, et il est **inchangé** : mêmes règles
qu'auparavant, `/classified-search?`, `/list.htm`, `/slf/api/Listings/listing/`
et les autres API fermées. Rien n'indique un changement de politique qui
justifierait de réessayer. Les digests e-mail SeLoger restent la voie conforme.

## Colocation, chambre chez l'habitant, moyenne durée et réseaux sociaux (étude du 2026-09-16)

Quatorze candidats fournis par l'utilisateur, évalués un par un : `robots.txt`
lu et cité, quelques requêtes espacées de trois secondes avec le User-Agent du
collecteur (`MaiounBot/0.1`), code HTTP relevé, **volume réel mesuré sur Nice et
le périmètre**, champs publiés, et la question qui décide — **le contact est-il
gratuit ?** Aucun anti-bot, aucun captcha, aucun mur d'inscription n'a été
contourné : là où c'est fermé, la réponse est « on ne la prend pas », et elle
est écrite ici.

**Deux retenues** : MorningCroissant et Appartager. **Douze écartées.**

### Ce que ces plateformes valent pour CE compte, dit avant d'implémenter

Deux réserves ont été posées avant d'écrire la moindre ligne, et elles tiennent
toujours :

1. **Le compte exclut les colocations** (`excludeFlatShare` dans
   `MVP_CRITERIA`). Une source 100 % colocation n'ajoute donc rien à la liste
   tant que ce filtre n'est pas levé. Appartager est dans ce cas : elle entre
   **à la demande explicite de l'utilisateur**, marquée colocation sur chacune
   de ses annonces, et servira le jour où il changera d'avis. Elle ne gêne rien
   entre-temps : le filtre l'écarte proprement.
2. **Le meublé TOURISTIQUE et la courte durée ne sont pas des logements à
   l'année.** C'est ce qui a éliminé Roomlala, Cohebergement et Whoomies, dont
   les tarifs sont affichés **à la nuit**. Le projet s'en protège déjà à un
   second niveau : `isShortPeriodPrice` écarte tout prix à la nuitée ou à la
   semaine, pour toutes les sources.

### MorningCroissant (morningcroissant.fr) — retenue

| Point              | Mesure du 2026-09-16                                                                                                                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `robots.txt`       | `User-agent: *` autorise `/location/*` et `/appartement/*`. Interdits, et jamais appelés : `/search/ajax`, `/autocomplete`, `/appartement/reservation`, `/appartement/request`, `/appartement/bidding`, `/appartement/pre-book`, `/login`, `/reservation`, `/photo-gallery/`. |
| CGU                | Version du 5 février 2026, 74 275 caractères de texte. **Zéro occurrence** de « robot », « aspiration », « moissonnage », « scraping » ou « base de données ». Rien à respecter au-delà du `robots.txt`.                                                                      |
| Accès              | HTTP **200**, rendu **serveur** complet. `/location/nice`, puis `?page=2..4`.                                                                                                                                                                                                 |
| Volume             | **92 annonces** sur « Nice » — qui est un **rayon** : Saint-Laurent-du-Var (06700), Villefranche-sur-Mer (06230) et Beaulieu-sur-Mer (06310) en font partie. 4 pages de 24. Une seule entrée couvre donc le périmètre.                                                        |
| Budget             | Loyers triés : **5 annonces à 700 € ou moins** (590 ×4, 690), 16 à 900 € ou moins, médiane autour de 1 400 €.                                                                                                                                                                 |
| Bailleurs          | **48 particuliers, 41 loueurs professionnels.** La fiche l'écrit : `#host-contact .type` vaut « Particulier » ou « Professionnel ».                                                                                                                                           |
| Colocation         | **91 « Logement entier », 1 « Chambre privée »** (`/appartement/chambre-etudiante-…`, 740 €, 12 m²). Le champ « Type de location » le dit ; on le transmet tel quel.                                                                                                          |
| Durée              | Ce ne sont **pas** des meublés touristiques. La page tarifaire énumère les baux : civil de date à date, **mobilité 1 à 10 mois**, **étudiant 9 mois**, tacitement renouvelable (1 an meublé, 3 ans nu). Chaque fiche porte « Durée minimum / maximum / préavis ».             |
| Champs de la fiche | Loyer **hors charges**, charges mensuelles, loyer **charges comprises**, dépôt, surface, catégorie, étage, capacité, chambres, salles de bain, **DPE et GES** (deux échelles distinctes), équipements, quartier.                                                              |
| Charges            | **Le montant de la carte est charges comprises**, et la fiche le décompose (950 + 30 = 980). Mesuré, pas supposé.                                                                                                                                                             |
| Contact            | **Gratuit, mais derrière un compte** : « Contacter le loueur » ouvre la messagerie. Ni téléphone ni e-mail publiés — le parseur n'en invente donc aucun. **Ce n'est pas `paidContact`** : la plateforme ne vend pas le contact, elle prend une commission sur la location.    |
| Ce que ça coûte    | Frais de service du locataire **offerts pour un bail de moins d'un an** ; **8, 10 ou 12 € TTC par m² selon la ville** pour un bail d'un an ou de trois ans. Le loueur paie 4,5 % TTC des loyers encaissés. Écrit dans les notes du descripteur, pour que rien ne surprenne.   |

**Pourquoi elle compte particulièrement ici.** La plateforme écrit noir sur
blanc : « Locations ouvertes aux CDI (**période d'essai ou pas**), CDD,
étudiants, stagiaires, entrepreneurs, indépendants, intermittents, intérimaires
[…] Pas de discrimination : les dossiers sont traités par ordre d'arrivée ». Et
elle garantit les loyers au bailleur jusqu'à 90 000 € — c'est-à-dire qu'elle
porte elle-même le risque que les agences sous assurance loyers impayés
refusent de porter. C'est exactement l'obstacle que rencontre l'utilisateur.

### Appartager (appartager.com) — retenue, marquée colocation

| Point        | Mesure du 2026-09-16                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Éditeur      | **Roomgo Limited** (ex-SpareRoom) ; les photos sont servies par `photos.spareroom.fr`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `robots.txt` | 30 882 octets. Le groupe `User-agent: *` interdit **toutes les URL de recherche paramétrées** : `/colocations/*min_rent=`, `*max_rent=`, `*sort_by=`, `*filter=showall`, `*KW=`, `*lookup=`, `*user_id=`, `*gender_req=` et une soixantaine d'autres, plus `/pro/*`, `/location/search.pl?*action=search`, `/location/shortlist.pl` et `/location/savesearch.pl`.                                                                                                                                                                                                                                                                                                                                    |
| Voie suivie  | La page de ville **nue** `/colocations/nice`, sa **pagination par CHEMIN** (`/colocations/nice/page2`, `page3`) et les fiches `/colocations/{dept}/{ville}/{id}` — **aucune règle ne les vise** : les Disallow portent tous sur un paramètre, donc sur un `=`, qu'aucune de ces adresses ne contient.                                                                                                                                                                                                                                                                                                                                                                                                |
| Accès        | HTTP **200**, rendu **serveur** (82 009 octets).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Volume       | **22 annonces**, réparties **10 + 10 + 2 sur trois pages** — la première n'en montre que dix, et s'y arrêter aurait perdu la moitié du stock sans rien signaler. Loyers mensuels de **400 à 850 €**, parfois donnés en **fourchette** (« €450 - €470 ») quand l'annonce propose plusieurs chambres.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Colocation   | **100 %.** Chaque annonce est une chambre dans un logement partagé. `flatShare` est déclaré vrai pour les 22, sans faire relire le texte. **Le libellé de la carte piège** : il nomme tantôt la chambre (« Chambre simple »), tantôt le logement d'accueil (« Appartement à 3 lit(s) »), tantôt le lot proposé (« 2 simples + double », « 4 doubles »). Pris pour le type du bien, il classait 4 annonces sur 22 en « appartement » ou « autre » — dont un 88 m² à 635 € alors que sa fiche répartit ce loyer entre **trois** chambres et signale « 3 jeunes actifs en place déjà ». Le parseur ne retient le libellé comme type que s'il nomme une chambre ; sinon il le range dans la description. |
| Contact      | **Payant selon l'annonceur**, et la source le dit sur sa propre carte : « Contacter gratuitement » quand l'annonceur a pris l'abonnement Premium, sinon « Upgrade to Premium membership for unlimited contact access ». D'où **`paidContact: true`** sur le descripteur, et le libellé conservé annonce par annonce dans `extra.contactStatus`.                                                                                                                                                                                                                                                                                                                                                      |
| Durée        | **Mêlée.** La carte n'en dit rien ; la fiche révèle « Locations à court terme acceptées » et « Durée maximum : 3 mois maximum » — trois mois n'est pas un logement. Ces mentions sont reprises **en tête de description**, là où l'utilisateur les lit et où la normalisation reconnaît les baux qui s'arrêtent.                                                                                                                                                                                                                                                                                                                                                                                     |
| Non publié   | **Ni surface, ni charges, ni dépôt de garantie** — vérifié sur la carte et sur la fiche (zéro occurrence de « m² », « charges », « caution », « dépôt »). Ces champs restent **absents**, jamais reconstitués. **Réserve à connaître** : faute de champ dédié, la surface éventuellement affichée est lue dans le TITRE, et le titre d'une colocation décrit souvent le **logement d'accueil** (« Super appartement 88m2 ») et non la chambre. Le type de bien, lui, reste « chambre ».                                                                                                                                                                                                              |
| Bailleur     | **Non déclaré.** « Membre Premium » est un niveau d'abonnement, pas une qualité professionnelle, et le site prévoit un signalement « L'annonceur n'est pas une agence » — des agences y publient donc. `landlordKind` reste `unknown` : on ne suppose pas.                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### Les douze écartées

| Source                                             | Vérifié    | Verdict                                           | Preuve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | ---------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **La Carte des Colocs** (lacartedescolocs.fr)      | 2026-09-16 | 🔴 Anti-bot Cloudflare                            | Le `robots.txt` se lit sans peine (200, 312 octets ; il ferme `/listings/`, `/users/get_profiles`, `/geocoder/`, `/admin_panel/`). Mais **toute page d'annonces répond 403**, avec la page de défi Cloudflare « Just a moment… » et son `script-src https://challenges.cloudflare.com` : vérifié sur `/colocations/france/nice` **et** sur `/colocations`, à trois secondes d'intervalle. Passer outre serait contourner une protection (§10) : on s'arrête.                                                                         |
| **Whoomies** (whoomies.com)                        | 2026-09-16 | 🔴 N'est plus une source de colocation            | Le domaine a changé de métier. `/france/nice` rend « **Top 13 Chambres d'Hôtes à Nice 2026 — Dès 30 €** » et une liste de B&B et d'hôtels ; le `robots.txt` ferme `?page=hotel_ajax`, `?page=hotellist_json` et `*/hotel/*` ; le sitemap `hotels_fr__00.xml` aligne 5 000 sous-domaines du type `bbhotelnicestaderiviera.whoomies.com`. C'est un annuaire **touristique**, pas du logement à l'année.                                                                                                                                |
| **Colocation Adulte** (colocationadulte.fr)        | 2026-09-16 | 🔴 Domaine mort                                   | Aucune résolution DNS sur `colocationadulte.fr` ni sur `colocationadulte.com` : `fetch failed` sur les deux, avec et sans `www`.                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Roomlala** (roomlala.fr)                         | 2026-09-16 | 🔴 Tarifé à la NUIT                               | `robots.txt` ferme `/search/`, `/api/search-filters/`, `/api/search-section/`, `/myspace/` et `/user/` ; la page de catégorie `/chambre-chez-l-habitant/nice-5424` est en revanche ouverte et rend **52 annonces** en clair. Mais le prix y est **à la nuitée** — « 18 €/nuit, 1 semaine minimum », « 40 €/nuit, 2 nuits minimum », « 80 €/nuit » — et le filtre de loyer commence à « 10 €/nuit ». Chambres de **12 à 20 m²**. Le site se présente lui-même comme « une chambre chez l'habitant pour un **séjour** unique ».        |
| **Cohebergement** (cohebergement.com)              | 2026-09-16 | 🔴 Réservation à la nuitée, adresse cachée        | `robots.txt` laisse passer `/location/*` (il ne ferme que `/accommodation/*/contact`, `/messaging/contact-*`, `/alert/*/contact/ajax`, `/login`). `/location/l/20-nice` rend **15 annonces** en clair, toutes « CHAMBRE CHEZ L'HABITANT », avec trois prix — nuit, semaine, mois (35 €/220 €/600 €). Le fonctionnement est celui d'une réservation : « demande de réservation », « conditions d'annulation », « si la durée est supérieure à **90 nuitées** », et **l'adresse n'est donnée qu'après acceptation de la réservation**. |
| **Ensemble2Générations** (ensemble2generations.fr) | 2026-09-16 | 🔴 Aucune annonce publique                        | `robots.txt` entièrement ouvert (`Allow: /`, seule l'administration Kirby est fermée) et sitemap complet — mais il ne compte que **68 pages statiques**, aucune annonce. L'agence de Nice publie un courriel et un téléphone, pas des logements : la mise en relation se fait sur **inscription**, « à partir de 10 € par mois », et l'association revendique **150 binômes depuis 2012** dans les Alpes-Maritimes. Rien à collecter.                                                                                                |
| **ToitChezMoi** (toitchezmoi.com)                  | 2026-09-16 | 🔴 Logement contre services, et rendu côté client | Le `.fr` ne résout pas ; le `.com` répond 200 avec un `robots.txt` accueillant (`Content-Signal: ai-train=no, search=yes`, `ClaudeBot: Allow: /`, seules les zones membres fermées). Mais **ce n'est pas une location** : « Chambre, appartement ou maison **en échange de services** », « Soyez logé **gratuitement** en rendant quelques services ». Et la recherche est rendue par Alpine.js (`x-for`, `x-text`, `x-cloak`, « Aucun résultat » en dur) : aucune annonce dans le HTML servi.                                       |
| **Wunderflats** (wunderflats.com)                  | 2026-09-16 | 🔴 Volume nul sur le périmètre                    | `robots.txt` court et permissif (il ne ferme que `/api/*` et quelques paramètres). Mais `/fr/appartements-meubles/nice` répond **404**, le sitemap français (98 URL) ne couvre que **Paris et ses arrondissements**, et le pied de page annonce les destinations : Berlin, Munich, Hambourg, Francfort, Düsseldorf. Rien à Nice.                                                                                                                                                                                                     |
| **Sublet.com**                                     | 2026-09-16 | 🔴 Volume nul, et JavaScript obligatoire          | `robots.txt` ouvert (il ne ferme que des répertoires techniques). Mais `/City_Rentals/France/Nice_rentals.asp` **redirige vers l'accueil**, et `rent.asp?city=Nice&country=France` aboutit sur « **Location not found.** Use advanced search below ». La page prévient : « Website doesn't work properly without javascript enabled », et oppose un `recaptcha` de connexion. Le sitemap n'a pas répondu.                                                                                                                            |
| **Badi** (badi.com)                                | 2026-09-16 | 🔴 Pas de France, et rendu côté client            | `robots.txt` grand ouvert (`Allow: /`). Mais le sitemap (33 URL) ne liste **que l'Espagne** : Barcelone, Madrid, Valence, Séville, Grenade, Malaga, Bilbao — **aucune ville française**. Et `/s/nice-france` répond 200 sur 434 138 octets dont le texte servi tient en une ligne : « Badi — Rooms and Apartments for Rent · Publish a listing · Register · Log in ». Tout est chargé en JavaScript.                                                                                                                                 |
| **Facebook Marketplace et groupes Facebook**       | 2026-09-16 | 🔴 Collecte automatisée interdite par Meta        | Le `robots.txt` de `facebook.com` s'ouvre sur l'interdiction elle-même : « **Collection of data on Facebook through automated means is prohibited unless you have express written permission from Facebook** », avec renvoi aux _Automated Data Collection Terms_. Les rares agents nommément autorisés le sont sous conditions ; tous les autres, dont le nôtre, ne le sont pas. S'y ajoute le mur d'inscription : ni Marketplace ni un groupe ne se lisent sans compte. **On n'essaie pas.**                                       |
| **Nextdoor** (nextdoor.com / nextdoor.fr)          | 2026-09-16 | 🔴 `Disallow: /` pour tout le monde               | `nextdoor.fr` ne résout pas ; `nextdoor.com` répond 200. Son `robots.txt` (2 990 octets) nomme une dizaine de moteurs, puis se termine par le groupe qui nous concerne : `User-agent: *` / **`Disallow: /`**, avec pour seules exceptions `/link_preview_image/` et `/for_sale_and_free/`. `GPTBot` y est explicitement `Disallow: /`. Le réseau exige de surcroît la vérification d'une adresse postale. **On n'essaie pas.**                                                                                                       |

### Ce que ces deux ajouts changent au code partagé

Une seule modification hors des deux dossiers de source :
`normalization/normalize.ts` accepte désormais une **déclaration explicite de
colocation** (`extra.flatShare`), exactement comme il acceptait déjà
`extra.landlord` pour Bien'ici. La raison est la même, et elle est sérieuse :
`parseFlatShare` fouille un titre et une prose, alors que MorningCroissant
**classe** chaque annonce (« Logement entier » / « Chambre privée » / « Chambre
partagée ») et qu'Appartager ne publie **que** des colocations. Deviner ce qui
est écrit n'aurait pas été prudent mais négligent — et l'enjeu est une
**exclusion** : une chambre partagée qui ressort `null` passe le filtre
`excludeFlatShare` et part en alerte.

## Portails de particuliers et portails étudiants (étude du 2026-09-16)

Douze candidats examinés un par un, avec le user-agent du collecteur
(`MaiounBot/0.1 (+…)`), trois secondes entre deux requêtes, et le `robots.txt`
lu avant toute autre page. Aucun captcha, aucun mur d'inscription, aucun
paywall n'a été franchi : quand c'est fermé, la réponse est « on ne la prend
pas », avec la preuve.

Le besoin qui commande ce tri : sur 5 248 annonces, 647 sont de particuliers,
mais 629 chez **LocService**, dont le contact est payant — soit une vingtaine
de bailleurs particuliers réellement joignables.

### Verdicts

| Candidat               | Verdict                   | Preuve du 2026-09-16                                                                    |
| ---------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| **ImmoJeune**          | **retenue, implémentée**  | robots ouvert, listes lisibles, badge PARTICULIER/AGENCE, contact gratuit               |
| PAP                    | fermée (reste désactivée) | HTTP 403 + défi JavaScript Cloudflare, pour `curl` comme pour `fetch`                   |
| Entreparticuliers      | fermée                    | HTTP 403 Cloudflare « Sorry, you have been blocked » sur toutes les pages               |
| Leboncoin              | fermée                    | `robots.txt` : accès automatisé interdit, aucun groupe `User-agent: *`                  |
| Gens de Confiance      | fermée                    | `robots.txt` interdit `*/annonce/*/*` ; défi Cloudflare ; plateforme sur parrainage     |
| Lokaviz (CROUS)        | fermée                    | contact derrière un compte MesServices.etudiant.gouv.fr ; robots ferme la recherche     |
| TopAnnonces            | écartée — doublon         | mêmes identifiants d'annonce que ParuVendu, déjà collecté                               |
| Vivastreet             | écartée — volume nul      | **7** annonces pour TOUT le 06, dont deux demandes de logement                          |
| France-Troc            | écartée — hors sujet      | rubrique IMMOBILIER = « troc immobilier » + « location de vacances », rien à l'année    |
| Immo-Particulier       | écartée — n'existe pas    | WordPress de démonstration ; les variantes `.fr` ne résolvent pas                       |
| Vendre-Louer.fr        | écartée — n'existe pas    | page de parking de domaine LWS, certificat invalide                                     |
| Location-Etudiant.fr   | écartée — pas d'annonces  | les 15 « annonces » de Nice sont des résidences ; une adresse « nice » a servi du Nîmes |
| DossierFacile / Visale | hors périmètre            | outils de dossier, pas des sources d'annonces — voir plus bas                           |

### ImmoJeune (immojeune.com) — retenue

```
Source            : ImmoJeune
URL               : https://www.immojeune.com
Type              : portal
robots.txt vérifié le : 2026-09-16
Chemins autorisés utilisés : /location-particulier/*, /location-etudiant/*, /colocation/*
Méthode           : html
Volume mesuré (périmètre) : 38 cartes lisibles, dont 35 à Nice
Contact           : GRATUIT (formulaire de candidature, gardé par un Turnstile — non automatisable)
Difficulté technique : faible
Risque de blocage : faible
Priorité          : 1
```

**`robots.txt` intégralement cité** (126 octets, le fichier entier) :

```
User-agent: *
Disallow: /user/*
Disallow: /cdn-cgi/l/email-protection
Sitemap: https://www.immojeune.com/sitemaps/sitemap.xml
```

Rien de ce que nous lisons n'est interdit, et le sitemap déclare les fiches.
Les listes répondent 200 au user-agent du collecteur, sans défi ni cookie.

**La question qui décide : l'utilisateur n'est pas étudiant.** Le portail l'est,
ses annonces ne le sont pas. Les fiches relevées sont des studios et des
deux-pièces ordinaires, décrits sans aucune condition d'étudiant, et le
formulaire de candidature propose **« Salarié »** et **« Autres »** à côté des
statuts étudiants. On ne pose donc aucun drapeau « réservé aux étudiants »
depuis la source : la détection par le texte tranche annonce par annonce,
comme partout — elle sait déjà séparer « bail étudiant » de « idéal étudiant ».

**Un piège, qui aurait rendu la source inutile sans qu'on le voie.** Les
adresses des fiches sont de la forme `…/location-etudiant/nice-06/…`, et
`isStudentHousing` excluait toute annonce dont l'URL contenait ce mot. La
source entière se serait exclue d'elle-même, silencieusement. Le même mot dit
pourtant deux choses selon sa place : chez **Dazur**, il est glissé dans le
slug du bien (`…/location+appartement+nice+location-etudiants+86`) et qualifie
CE bien ; chez ImmoJeune, c'est la **première case du chemin**, la rubrique par
laquelle passent toutes les locations du site. La règle ne regarde donc plus la
première case. Le texte, lui, continue de trancher dans les deux cas.

**Ce que la source déclare elle-même, et qu'on ne devine donc pas :**

| Drapeau       | D'où il vient                                                           |
| ------------- | ----------------------------------------------------------------------- |
| `landlord`    | premier badge de la carte ET de la fiche : `PARTICULIER` ou `AGENCE`    |
| `flatShare`   | rubrique `/colocation/` de l'adresse, ou badge `COLOCATION`             |
| type de bien  | second badge : `STUDIO`, `T2`, `CHAMBRE`, `APPARTEMENT`, `MAISON`       |
| meublé        | équipement déclaré « Meublé », pas une lecture du titre                 |
| charges       | le `<sup>CC</sup>` collé au loyer, plus le montant du poste « Charges » |
| commune et CP | ligne `.geo` de la carte, puis l'adresse de la fiche — jamais l'agence  |
| DPE et GES    | nom du dessin servi : `dpe-c.svg`, `ges-b.svg`                          |

**Ce qui est écarté à la lecture** : les `residence-etudiante` (un exploitant,
un loyer « à partir de » qui ne désigne aucun logement, accès réservé aux
étudiants — six d'entre elles occupent à elles seules les deux premières pages
de la liste niçoise) et les `location-courte-duree`, qui ne sont pas des
locations à l'année.

**Les liens obfusqués ne sont pas décodés.** Une partie des cartes remplace son
`<a href>` par `<span class="obflink" data-encoded-link="…">`, l'adresse en
base64. Le site signale par là qu'il ne veut pas voir ces liens suivis
automatiquement : les décoder serait passer outre. Le coût est mesuré et il est
acceptable — **38 cartes lisibles sur 46** dans la rubrique particuliers de
Nice, contre **1 sur 12** dans la liste des agences. C'est aussi pourquoi la
collecte passe par `/location-particulier/` : c'est là que les liens sont en
clair, et là que se trouve ce que ce compte cherche.

**La candidature ne s'envoie pas depuis Maïoun** (relevé le 2026-09-17). Le
formulaire de la fiche est `<form name="candidate" method="post"
action="/candidate/{id}/process">`, et il porte, entre le message et le bouton
« Candidater », un **Turnstile Cloudflare** (`<div class="captcha-ts">`, rendu
explicitement par `turnstile.render`). Il porte aussi un jeton CSRF Symfony lié
à la session, `candidate[_token]`. Ses champs :

| Champ                                        | Obligatoire | Source dans le dossier locataire    |
| -------------------------------------------- | ----------- | ----------------------------------- |
| `candidate[candidateinformation][firstname]` | oui         | `firstName`                         |
| `…[lastname]`                                | oui         | `lastName`                          |
| `…[email]`                                   | oui         | `email`                             |
| `…[phoneTmp]`                                | oui         | `phone`                             |
| `…[statut]`                                  | non         | `situation`                         |
| `…[salary]`                                  | oui         | `monthlyIncome`                     |
| `…[receipts]` (revenus du garant)            | oui         | **aucune**                          |
| `…[entryDate]`                               | oui         | `moveInDate`                        |
| `…[duration]` (durée de location)            | oui         | **aucune**                          |
| `…[needGuarantor]`, `…[needHomeInsurance]`   | non         | démarchage partenaire, jamais coché |
| `…[message]`                                 | non         | message de candidature              |

Deux obstacles, et le premier suffit. Le Turnstile dit que le site ne veut pas
d'envoi automatisé, et le projet ne contourne aucun anti-bot : la source est
donc inscrite dans `AGENCY_FORM_REFUSALS`. Les **conditions générales de vente**
le confirment sans l'interdire par écrit — l'article 8.2 plafonne les
candidatures à **trois par jour** et vend le déplafonnement : le site compte les
envois et en fait un produit. Ni le `robots.txt` ni les CGU ne contiennent les
mots « robot », « automat », « extraction » ou « scraping ». Le chemin reste
« copier le message, ouvrir le formulaire », et les deux champs sans source
auraient de toute façon bloqué : les revenus d'un garant ne s'inventent pas.

**Le sitemap ne sert pas de point d'entrée**, bien qu'il déclare 137 annonces du
périmètre. Il garde les annonces parties : sur 28 tirées au sort et demandées,
**5 seulement répondaient encore** (18 %). Une annonce disparue ne rend pas 404
— le site **redirige vers son accueil en 200**. Les listes, elles, ne montrent
que ce qui est en ligne : ce sont elles qu'on lit, et l'extinction se fait par
absence. Le parseur refuse en outre de lire une page d'accueil comme une
annonce.

**Cap-d'Ail répond 404** là où les douze autres communes du périmètre rendent
une page, fût-elle vide : elle n'est pas demandée.

### PAP — recontrôlée, toujours fermée, et plus qu'avant

Vérification du 2026-09-16, au user-agent du collecteur :

| Adresse                                                           | Code | Corps                             |
| ----------------------------------------------------------------- | ---- | --------------------------------- |
| `https://www.pap.fr/robots.txt`                                   | 200  | 15 315 octets                     |
| `https://www.pap.fr/annonce/locations-nice-06-g8979` (fetch Node) | 403  | `<title>Just a moment...</title>` |
| la même, en `curl`                                                | 403  | idem                              |

Le `robots.txt` **n'a pas changé de politique** : son groupe `User-agent: *`
interdit `/*?*`, `/annonce/liste/`, `/recherche/detail/`, `/proximite/`,
`/pagination/` et une liste de facettes `/annonce/*-coloc*`, `*-jardin*`… mais
**pas** `/annonce/locations-{ville}-g{id}`, que le sitemap
`liste_annonces.xml` déclare toujours.

Ce qui a changé, c'est le pare-feu. En août, le filtrage portait sur
l'empreinte du client : même UA, même IP, `curl` passait quand `fetch` Node
recevait 403. **Aujourd'hui les deux reçoivent 403**, et la page servie est le
défi JavaScript de Cloudflare. Le franchir demanderait d'exécuter ce défi :
c'est exactement le contournement que le projet s'interdit. La source reste
désactivée, son code et ses tests prêts ; la revérification tient en deux
requêtes.

### Entreparticuliers.com — fermée

Le `robots.txt` (200) est pourtant accueillant : son groupe `User-agent: *` ne
ferme que `/api/`, `/tools/`, `/espace-perso/` et `/mot-de-passe-oublie`, et
déclare `https://www.entreparticuliers.com/sitemap.xml`. Le long bloc qui suit
ne nomme que des aspirateurs de sites, dont notre user-agent ne fait pas partie.

Mais **aucune page ne répond**. L'accueil comme le sitemap rendent **403**, avec
le corps Cloudflare `<title>Attention Required!</title>` et « **Sorry, you have
been blocked** » — un blocage ferme, pas un défi que le site attendrait de nous
voir résoudre. Il n'y a rien à tenter qui ne soit un contournement.

### Leboncoin — fermée, et écrit en toutes lettres

Le `robots.txt` s'ouvre sur deux lignes qui suffisent :

```
## It's forbidden to use search robots or other automatic methods to access Leboncoin.fr.
## Access is only permitted with special permission from Leboncoin.fr.
```

Le fichier ne contient **aucun groupe `User-agent: *`** : il n'énumère que des
robots nommés — Googlebot, bingbot, les agents d'IA, `facebookexternalhit` — et
`Disallow: /annonce*` s'applique même à ceux-là. Un client non nommé n'a donc
aucune permission. **Aucune page d'annonce n'a été demandée** : une page
interdite ne se demande pas, fût-ce pour constater qu'elle répond.

Le canal légitime reste **l'alerte e-mail**, déjà branchée et productive.

### Gens de Confiance — fermée, trois fois

1. `robots.txt` : `disallow: */annonce/*/*` — les fiches d'annonces, précisément.
2. `https://gensdeconfiance.com/fr` répond **403** avec le défi Cloudflare
   « Just a moment... ».
3. La plateforme fonctionne **sur parrainage** : il n'existe pas de partie
   publique où les annonces seraient consultables sans compte.

Aucune des trois ne se lève sans franchir quelque chose.

### Lokaviz (CROUS) — fermée, et sans objet pour ce compte

Le `robots.txt` ferme la recherche presque entièrement :

```
Disallow: /recherche/
Disallow: /rechercher-un-logement/page:*
Disallow: /rechercher-un-logement/fiche-logement/*
Disallow: /rechercher-un-logement/liste-des-logements?
```

Et surtout, l'accueil (200, lu) dit comment on obtient un contact :
« **Connectez vous sur Mes services étudiant pour accéder aux coordonnées des
propriétaires** ». Les coordonnées sont derrière un compte
`MesServices.etudiant.gouv.fr`, qui suppose un numéro d'étudiant. L'utilisateur
n'est pas étudiant : même ouverte, la source ne lui donnerait aucun contact.

### TopAnnonces — ouverte, mais c'est ParuVendu

Le `robots.txt` est court et permissif (`Disallow: /compte/`, `Disallow: /*?*`),
et les listes répondent 200. La page de Nice annonce **28 annonces** — 18
appartements, 6 parkings, 3 colocations, 1 « autres » (une licence IV) — sous
la bannière « 100 % annonces de particuliers ».

**C'est le même stock que ParuVendu, déjà collecté.** Le pied de page l'annonce
(« Les sites du groupe ParuVendu »), les gabarits viennent de
`static.paruvendu-dev.fr`, et la preuve est dans les identifiants : la page
ParuVendu `/immobilier/recherche/location/appartement/nice/` publie dans sa
couche de mesure `gtm_idpa1: '1295342904'`, `gtm_idpa2: '1295382412'`,
`gtm_idpa3: '1295199212'` — **exactement** les identifiants des annonces
niçoises de TopAnnonces.

L'ajouter ne donnerait aucune annonce nouvelle et en ferait entrer dix-huit en
double, là où ParuVendu est déjà réglé finement (bandes de loyer, treize
communes, détection des demandes). ParuVendu lit d'ailleurs déjà, carte par
carte, le « Particulier » que TopAnnonces met en bannière.

À noter au passage : la même **demande** de logement (« Homme senior retraité
CHERCHE une location ») se retrouve sur TopAnnonces et sur Vivastreet. Le
drapeau `hostsWantedAds` de ParuVendu la couvre déjà.

### Vivastreet — ouverte, et vide

`robots.txt` : `Disallow: /search/*` et quelques facettes — dont, notablement,
`*/particulier$` et `*/particulier+*`, si bien qu'on ne pourrait pas filtrer
sur le type d'annonceur par l'adresse. Les pages de commune, elles, sont
ouvertes et déclarées dans `sitemapindex-locations.xml`.

Le compte est sans appel : `/immobilier-location/nice` annonce **7 résultats**
« dans un rayon de … », et `/immobilier-location/alpes-maritimes` en annonce
**7** aussi — sept annonces pour tout le département. Sur les sept : deux sont
des **demandes** de logement, quatre sont hors périmètre (Cannes, Mougins,
Mandelieu, Vallauris), il reste **un** studio meublé à Nice. Il n'y a pas de
source là.

### France-Troc — hors sujet

`robots.txt` : `Disallow:/gerer_admin/`, rien d'autre. Site entièrement ouvert.

Mais sa rubrique IMMOBILIER ne contient que deux sous-rubriques : **« Troc
immobilier »** (échange de biens) et **« Location de vacances »**. Il n'existe
aucune rubrique de location à l'année. Le site est un site de troc, et il ne
prétend pas être autre chose.

### Immo-Particulier — le site n'existe pas

`www.immo-particulier.com` sert un certificat au nom de `gparm7.siteground.biz`.
L'apex `immo-particulier.com` répond, et son `robots.txt` est celui d'un
WordPress standard. Mais son sitemap de pages dit ce qu'il est vraiment :
`sample-page`, `boutique`, `panier`, `commander`, `restaurants`, `spa`,
`rooms`, `booking-calendar-…` — un **WordPress de démonstration** avec un thème
d'hôtellerie et WooCommerce, jamais configuré. Aucune annonce.

Les variantes ont été essayées : `immo-particulier.fr`,
`www.immo-particulier.fr`, `immoparticulier.com`,
`www.immobilier-particulier.com` — aucune ne résout.

### Vendre-Louer.fr — domaine garé

Ni `vendre-louer.fr` ni `www.vendre-louer.fr` n'ont de certificat valide
(`self-signed certificate`). En clair, les deux répondent 200 — avec la page de
parking de l'hébergeur : « **Bravo ! Votre domaine vendre-louer.fr a bien été
créé avec LWS** ». Le `robots.txt` (`Crawl-delay : 60`) est celui du parking.
Il n'y a pas de site.

### Location-Etudiant.fr — ouverte, mais rien à prendre à Nice

`robots.txt` permissif (`/mce/`, `/acheter-louer/`, `/digischool/`,
`/paris-etudiant/`, `*&loyer*`), sitemap déclaré.

La page « Particuliers et professionnels » de Nice
(`/logement-etudiant/Nice-6088.html`) titre « **482 annonces** ». Le titre
trompe : elle ne porte que 15 liens d'annonce, et les trois qui ont été
demandées mènent toutes à des **résidences étudiantes** — Twenty Campus Nice
Angely, Appart'City — c'est-à-dire un exploitant, un loyer « à partir de », un
accès étudiant. Aucun bailleur particulier joignable.

Pire, la source **ment sur ses adresses** :
`/annonce-logement-etudiant/location-t1-nice-06100/1427081777.php` a servi la
fiche d'une résidence **Appart'City de Nîmes**, écoles nîmoises et CAF du Gard
comprises. Une source qui rend un bien d'une autre ville sous l'adresse de Nice
ne peut pas alimenter un inventaire : la collecter ferait entrer des annonces
fausses. Le site est de surcroît lent (19 à 23 secondes par page).

### DossierFacile et Visale — pas des sources, mais utiles au profil

Ni l'un ni l'autre ne publie d'annonces : ce sont des outils de **dossier de
location**, et ils n'ont donc rien à faire dans le registre des sources.

Ils ont en revanche un usage côté **profil locataire**, que l'application gère
déjà (profil et garanties) :

- **DossierFacile** (service public) certifie un dossier et en donne un lien
  partageable. Le porter dans le profil, à côté des garanties, permettrait de
  le joindre aux messages de contact — un bailleur particulier qui reçoit un
  dossier déjà vérifié répond plus volontiers qu'à une candidature nue.
- **Visale** (Action Logement) est une caution gratuite. Elle vise justement le
  point qui bloque ici : une période d'essai. La mentionner dans le message
  répond d'avance à l'objection, et les annonces qui l'acceptent le disent
  parfois — ImmoJeune affiche d'ailleurs un bandeau « Cette annonce accepte ».

**DossierFacile est désormais implémenté** (2026-09-18) : le profil porte un
champ « Lien DossierFacile », vérifié à la saisie — seul le domaine officiel
est accepté, en HTTPS, parce que ce lien part dans des messages adressés à des
agences. Le message de candidature le joint en le nommant. Seule l'adresse est
conservée : les pièces restent chez DossierFacile, qui les contrôle et les
tient à jour.

Visale, elle, reste une piste : elle figure déjà parmi les garanties du profil,
mais rien ne la met en avant auprès des annonces qui l'acceptent.

### Confiance Immobilière — l'agence est là, son site n'y est plus

Vérifié le **2026-09-17**. Agence FNAIM, 22 bis boulevard Dubouchage à Nice,
avec des bureaux avenue de la Californie et promenade des Anglais. Elle nous
était connue indirectement : c'est elle qui signe l'annonce
`CONFIANCE IMMOBILIERE` de la fixture Bien'ici. Verdict : **rien à collecter en
direct aujourd'hui**, et aucun code ajouté.

**`robots.txt` d'abord, et il n'y en a pas.**
`http://www.confianceimmobiliere.com/robots.txt` répond **404 Not Found
(nginx)**. En HTTPS la connexion n'aboutit pas : le certificat servi porte
`CN = *.adaptimmo.com` (Let's Encrypt, valable du 2026-07-27 au 2026-10-25),
dont les seuls noms sont `*.adaptimmo.com` et `adaptimmo.com` — le domaine de
l'agence n'y figure pas. Certificat mis de côté le temps du diagnostic, l'hôte
HTTPS répond **404 sur tout**, y compris la racine : c'est le serveur par
défaut, aucun site n'y est déclaré. En clair, la racine répond 200 avec pour
tout contenu `<title>Maintenance</title>` et « Ce site est actuellement
indisponible. » Les adresses encore indexées de l'ancien site Adaptimmo
(`/fr/location.htm`, `/fr/annonces/location/appartement/nice-p-r300-4-2-0-24299-1.html`)
répondent 404.

Ce n'est pas une panne du jour : la dernière capture réussie par Internet
Archive date du **2026-06-11**, et il n'y en a aucune depuis. Le site était déjà
en maintenance au relevé du 2026-09-14.

**Il n'existe pas d'autre adresse.** `confianceimmobiliere.com` et
`confianceimmobiliere.fr` pointent tous deux sur `92.222.125.44`, l'hôte
Adaptimmo en maintenance ; les autres variantes essayées
(`confiance-immobiliere.com`, `.immo`, `.net`, `confiance-immobiliere-nice.fr`,
`agence-confiance.fr`…) n'existent pas dans le DNS. La fiche FNAIM de l'agence,
annuaire de sa propre fédération, déclare toujours
`http://www.confianceimmobiliere.com` : elle n'a pas déménagé, elle est hors
ligne.

**La plateforme est pourtant identifiée : Netty.** Elle se lit sans jamais
toucher au site de l'agence, dans ce que celle-ci publie sur Bien'ici : ses
annonces portent des identifiants `netty-company56146lrb-appt-…` et un barème
d'honoraires hébergé sur
`https://files.netty.immo/file/company56146lrb/145/F08LR/bareme_des_honoraires.pdf`.
Le back-office est donc passé d'Adaptimmo à Netty ; la vitrine publique n'a pas
suivi. Le front Netty (`79.127.134.226`, l'hôte de nos sources Netty déjà en
place) n'a pas de certificat pour `confianceimmobiliere.com` : le site n'y est
pas encore servi.

**Volume, mesuré indirectement.** 8 locations à Nice le 2026-09-17 dans la
recherche Bien'ici du périmètre (`filterType: rent`, zone `-170100`), toutes
dans les Alpes-Maritimes, 06000 et 06200 ; la fiche FNAIM de l'agence en
annonce 4 de son côté. Ce sont des annonces déjà couvertes par nos sources
Bien'ici et FNAIM : la source directe n'apporterait pas de bien nouveau tant
qu'elle n'existe pas, seulement de l'avance et des champs plus complets.

**Ce qu'il y aura à faire quand le site reviendra.** Une entrée
`makeNettyScraper({ id: 'confiance-immobiliere', … })` en fin de
`sources/index.ts`, **sans parseur neuf** : l'adaptateur Netty couvre déjà le
gabarit. Revérifier alors le `robots.txt` — Netty écrit `Crawl-delay: 5`, qu'on
respecte tel quel — et relever l'adresse réelle du sitemap. Rien n'est écrit
maintenant parce que cette adresse serait inventée, et parce qu'une source
braquée sur un domaine mort dépense son budget en erreurs à chaque passage.

**Le retour n'est plus à guetter à la main** : l'agence est le premier candidat
de la veille décrite plus bas, et son sitemap est relu tous les vingt-trois
jours.

## La veille des candidats endormis (2026-09-17)

Les deux tiers des refus de ce document sont **datés et réversibles** : un site
en maintenance rouvre, un pare-feu se lève, un `robots.txt` change, un
inventaire vide se remplit. Chaque étude se terminait par « à resonder dans
quelques semaines », et personne ne le faisait. `sources/dormant.ts` transforme
ces verdicts en vérifications : pour chaque candidat, son motif, la date du
relevé, et **la preuve qui dirait que la situation a changé**.

**Vingt-trois candidats**, tirés des fiches ci-dessus :

| Motif                        | Candidats                                                                                                          | Ce qu'on relit                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| site mort ou en maintenance  | Confiance Immobilière, Locat'me, Somhome, Louervite, LesParticuliers, Annoncesjaunes, Webmycar, Annonces de France | le sitemap déclaré par le `robots.txt`                |
| anti-bot                     | PAP, Entreparticuliers, La Carte des Colocs, SeLoger                                                               | la page relevée comme autorisée — SeLoger, son robots |
| `robots.txt` fermé           | Manda, Marche.fr, Leboncoin, Nextdoor, Facebook, Square Habitat                                                    | **le `robots.txt`, et rien d'autre**                  |
| volume nul dans le périmètre | 123Loger, Qasa, Vivastreet, Wunderflats, Coliving.com                                                              | le sitemap ou la page de commune                      |

**Le coût, mesuré.** Un candidat par jour au plus, jamais deux fois le même dans
la quinzaine : le tour complet dure vingt-trois jours. Sondage réel des
vingt-trois le 2026-09-17, user-agent du collecteur, `robots.txt` lu d'abord,
quatre secondes entre deux requêtes : **27 requêtes au total**, soit **1,2 par
candidat** et **2 au maximum** (lecture du `robots.txt` puis du sitemap qu'il
déclare). Dix candidats n'en ont coûté aucune au-delà du `robots.txt`.

**Zéro réveil sur vingt-trois**, ce qui était le résultat attendu : aucun de ces
sites n'a changé depuis son relevé. C'est la mesure qui compte, parce que le
risque n'est pas de manquer un réveil, **c'est d'en annoncer un qui n'existe
pas**. Un 200 ne prouve rien : Confiance Immobilière répond 200 avec
« Maintenance », `vendre-louer.fr` répond 200 avec le parking de son hébergeur,
PAP répond 403 sous un défi Cloudflare. Un réveil se déclare donc sur :

- **trois adresses d'annonces** qui nomment ensemble une location, une commune
  du périmètre et une référence d'annonce — un code postal `06xxx` ne compte pas
  pour une référence, sinon l'index d'une ville passerait pour un inventaire ;
- ou, pour un refus de `robots.txt`, la **disparition de la règle** qui fermait,
  à trois conditions : le fichier en est un, un groupe nous concerne, et il ne
  porte **aucune interdiction écrite en clair** — c'est celle de Leboncoin, que
  la lecture des règles seule ne verrait pas.

Le réveil emprunte le canal d'exploitation existant (`notify/source-health.ts`,
étiquette `maioun-sources`) et **ne sonne qu'une fois** : le candidat est ensuite
retiré du tour.

**Ce que la veille ne saura pas voir**, et c'est assumé : un site revenu dont
l'accueil ne montre aucune annonce, un sitemap servi en `.gz` (123Loger),
un inventaire publié uniquement en JavaScript (Coliving, Badi), et un anti-bot
levé pour un navigateur mais pas pour nous. Dans tous ces cas elle se tait,
et le candidat reste au tour suivant.

## Les agences qu'on voit sans les collecter (relevé du 2026-09-17)

Confiance Immobilière était dans nos données depuis des semaines — son nom signe
treize annonces Bien'ici et FNAIM — sans être une source. Personne ne l'a su
avant qu'on la demande par son nom. `pnpm audit:data` porte désormais la liste
complète : les agences nommées dans les annonces **des portails**, rapprochées
des sources déjà en place.

**Le relevé du 2026-09-17** : 311 couples source–agence, **293 graphies**
distinctes, **51 agences sans source directe**. Les premières, par nombre
d'annonces apportées :

| Agence                                         | Annonces | Vues par           |
| ---------------------------------------------- | -------: | ------------------ |
| IMMOBILIERE GESTION TRANSACTION INVESTISSEMENT |       16 | fnaim              |
| ERA MARESOL IMMOBILIER                         |       14 | bienici, paruvendu |
| CAPGEST                                        |        6 | bienici            |
| AGENCE DE LA PLAGE                             |        5 | fnaim              |
| AGENCE REGIONALE                               |        5 | fnaim              |
| HABITAT ET EXPERTISE                           |        5 | bienici            |
| HATON IMMOBILIER                               |        5 | bienici            |
| Syngestone Immo                                |        5 | bienici, fnaim     |

**Comment les noms sont rapprochés**, puisque aucun portail ne publie
d'identifiant d'agence : forme comparable (minuscules, sans accent ni
ponctuation), puis **mots distinctifs** — « agence », « immobilier », « nice »,
« gestion », « habitat » et une vingtaine d'autres ne rapprochent personne —,
puis **forme tassée** avec containment à partir de huit caractères. C'est ce qui
réunit « Syngestone Immo » et « SYNGESTONE IMMO », « L ADRESSE CEC » et
« L'ADRESSE C.E.C.GORBELLA ».

**Le tri penche du côté du signalement** : manquer une agence coûte une source,
en signaler une déjà couverte coûte une ligne à relire. La contrepartie se voit
dans le relevé — « BEP ANTIBES » y figure alors que BEP est collectée, parce que
son seul mot distinctif est « antibes ». À l'inverse, deux fautes de frappe
restent deux entrées (« CITYA DALBERA » et « CITYA DALBERRA ») : il n'y a pas
d'orthographe de référence pour trancher.

**Trois candidats déjà étudiés y apparaissaient** et sont renvoyés à la veille
plutôt que présentés comme des sources manquantes : 123Loger (27 annonces via
ParuVendu), Confiance Immobilière (13) et Square Habitat (8).

## Réveiller l'agence nommée par un PORTAIL : mesuré, et écarté (2026-09-17)

Le mécanisme des alertes e-mail — quand un message nomme l'agence et qu'on la
collecte, sa source passe en tête de la file suivante — rapporte environ une
annonce par jour, parce que 8,7 % seulement des messages nomment un annonceur.
Les portails, eux, le nomment presque toujours. D'où la question, posée avant
d'écrire la moindre ligne : **faut-il étendre le réveil aux portails ?**

**Non.** Le volume est là, la couverture aussi, mais le gain ne l'est pas : il
reste **1,3 annonce par jour**, pour **22 agences réveillées par jour**. Le même
mécanisme rendait une annonce par réveil sur le canal e-mail ; ici, il en rend
une pour dix-sept. Mesure en lecture seule, aucune collecte lancée.

### Le volume : confirmé

Occurrences portant un nom d'annonceur, tous cycles de vie confondus, et graphies
distinctes :

| Portail          | Annonces nommées | dont actives | Noms distincts |
| ---------------- | ---------------: | -----------: | -------------: |
| Bien'ici         |              695 |          550 |            194 |
| FNAIM            |              317 |          225 |             75 |
| ParuVendu        |              280 |          195 |             40 |
| Studapart        |              219 |          201 |          **1** |
| MorningCroissant |               41 |           41 |          **1** |

LocService, Rentumo, ImmoJeune et les alertes e-mail n'en nomment aucun.
Studapart et MorningCroissant n'écrivent pas un nom mais une **qualité** —
« Loueur professionnel » — que les mots du métier écartent déjà : leurs 260
annonces ne désignent personne.

### La couverture : bonne, et ce n'est pas le problème

Le registre compte **216 sources**, dont **204 directes** (189 agences locales,
15 réseaux) et 12 portails ou agrégateurs. En passant les noms d'annonceur par
`createAgencySourceResolver` sur ces 204 sources :

| Portail   | Résolues vers une source directe | Taux | Agences distinctes |
| --------- | -------------------------------: | ---: | -----------------: |
| Bien'ici  |                          431/695 | 62 % |                111 |
| FNAIM     |                          132/317 | 42 % |                 37 |
| ParuVendu |                          132/280 | 47 % |                 10 |

### Le chiffre qui décide : 395 sur 695 sont déjà là

Sur les 695 annonces de portail résolues, **395 (56,8 %) partagent déjà leur
fiche avec une occurrence de l'agence visée** : gain nul, on a déjà la donnée.
Bien'ici 66 %, FNAIM 60 %, ParuVendu 23 %.

Restent 300 annonces non regroupées, et il leur manque beaucoup : l'adresse 225
fois (75 %), le téléphone 138 (46 %), les charges 102 (34 %), le DPE 57 (19 %),
la référence 16, les photos 7. **Mais un réveil ne les apporterait pas.** Depuis
qu'on a vu ces annonces, l'agence visée est déjà passée **43 fois (médiane)** :

| Passages chez l'agence depuis la découverte | Annonces |
| ------------------------------------------- | -------: |
| aucun                                       |        2 |
| 1 à 3                                       |       11 |
| 4 à 10                                      |       29 |
| 11 à 50                                     |      134 |
| plus de 50                                  |      124 |

Une annonce qui n'est pas regroupée après quarante-trois passages ordinaires ne
le sera pas au quarante-quatrième. Soit elle n'est pas sur le site de l'agence,
soit le dédoublonnage ne la rapproche pas — dans les deux cas, ce n'est pas un
problème de cadence.

### L'avance en temps : elle n'existe pas, et la mesure brute ment

Comparer les dates de première vue donnait **+9,8 h en faveur du portail**. C'est
un artefact : Bien'ici tourne depuis le 9 septembre, et **87 des 118 agences
concernées depuis moins de sept jours** (début médian : 14 septembre). Le portail
ne devançait pas l'agence, il existait avant elle.

En ne gardant que les paires où **les deux sources tournaient depuis 24 h au
moins**, il reste 76 paires, et l'avance disparaît :

| Portail   | Paires |     Médiane | Portail devant | Agence devant |
| --------- | -----: | ----------: | -------------: | ------------: |
| Bien'ici  |     49 |     −0,33 h |             22 |            25 |
| FNAIM     |     16 |     +0,14 h |              8 |             8 |
| ParuVendu |     11 |     −13,4 h |              1 |             7 |
| **Total** | **76** | **−0,33 h** |         **31** |        **40** |

L'agence voit l'annonce avant le portail plus souvent que l'inverse.

Et l'avance affichée ne se rattrape pas toute : **les agences sont relues toutes
les 2,1 h** (médiane observée sur 4 133 intervalles, 120 sources ; l'intervalle
déclaré est de 1,25 h). Un réveil ne peut donc anticiper que d'une cadence. Une
annonce vue 5 h avant l'agence n'était pas encore chez l'agence : la réveiller
n'y aurait rien trouvé.

Ce qui survit à ce filtre :

- 31 paires où le portail précède réellement ;
- **20** où la fiche de l'agence apporte au moins un champ manquant ;
- **9** dont l'avance tient dans une cadence — soit **1,29 annonce par jour**,
  avec **1,01 h** d'anticipation médiane. Bien'ici 3, FNAIM 5, ParuVendu 1.

À comparer aux 6,9 h d'avance de l'e-mail, 31 fois sur 47. Et la notification
part au mieux à la demi-heure suivante : une heure gagnée en vaut souvent une
demie une fois arrivée sur le téléphone.

### Le coût : modeste, contrairement à ce qu'on craignait

L'effet de masse redouté ne se produit pas. Les annonces de portail nommant une
agence connue désignent **21,7 agences distinctes par jour** en moyenne sur
quatorze jours — 12 à 36 les jours établis, avec une pointe à 98 le jour où
Bien'ici a été branchée. Un passage d'agence coûte 2,8 requêtes en moyenne, soit
**~70 requêtes par jour**, sur 4 119 (moyenne de quinze jours) ou 5 776 (sept
derniers jours) : **+1,2 à +1,7 %**. En passages, +22 sur ~1 190 par jour.

La cadence ne serait donc pas supprimée. **C'est le rendement qui condamne le
mécanisme, pas sa facture** : 22 réveils pour 1,3 annonce, quand le canal e-mail
rend une annonce par réveil.

### Le contre-argument, vérifié : l'avantage du canal e-mail disparaît

L'e-mail vaut parce qu'il **arrive entre deux passages** : il apporte une annonce
qu'aucune de nos sources n'a encore vue. Une annonce de portail, elle, est
découverte **pendant un passage ordinaire** — au moment où on la voit, l'agence a
déjà été relue il y a moins de 2,1 h, et la médiane dit qu'elle avait déjà
l'annonce. Le portail n'est pas un messager en avance, c'est une source parmi les
autres. Le mécanisme n'a rien à devancer.

### Ce que la mesure ne dit pas

- **La fenêtre est courte** : huit à quinze jours, et la plupart des sources
  d'agence tournent depuis moins d'une semaine. L'échantillon débiaisé ne compte
  que 76 paires. À trois mois de recul, la conclusion mérite d'être reprise.
- **Le dédoublonnage sert de vérité** pour « on l'a déjà ». Un regroupement
  manqué est compté comme « l'agence ne l'a pas ». Les 300 non regroupées
  contiennent peut-être de vrais doublons jamais rapprochés — ce serait un sujet
  de dédoublonnage, pas d'ordonnancement.
- **La cadence de 2,1 h est celle d'aujourd'hui.** Si le parc grossissait au
  point de ne plus relire les agences que deux fois par jour, le réveil
  redeviendrait intéressant : la mesure serait à refaire.
- **Rien n'a été collecté** pour cette étude. On n'a pas vérifié qu'un réveil
  trouverait effectivement la fiche : on a seulement montré que les passages
  ordinaires, eux, ne la trouvent pas.

## 123Loger et Maisonette (implémentées le 2026-09-22)

Deux sources demandées par leur nom, et une leçon commune : **l'absence au
sitemap n'est pas l'absence au site.**

### 123Loger (123loger.com) — implémentée

Écartée deux fois, à tort les deux fois. Le 2026-08-15 pour un sitemap cassé,
le 2026-09-16 pour un sitemap réparé mais sans le 06. C'est une annonce niçoise
reçue par e-mail qui a tranché : `www.123loger.com/location/nice-06000/appartement/6791fe67020c/`
répondait, alors qu'aucun sitemap ne la nommait.

- `robots.txt` (relu le 2026-09-22) : ferme `/search/`, `/feed/`, `/go/` et
  `/wp-admin/`. Le chemin `/location/<ville>-<cp>/<type>/` reste ouvert — c'est
  celui qu'on lit, et le seul.
- Inventaire : **13 pages publiques** pour « appartement à Nice », références
  portées par l'URL de chaque fiche.
- Budget : 13 pages de liste + 24 fiches par passage, 3 s entre deux requêtes.
- Les fiches ne sont enrichies que pour les annonces NOUVELLES ; rien de
  Premium, aucune candidature déposée.

**Ce qu'il faut en retenir pour la prochaine source** : un sitemap est une
déclaration, pas un inventaire. Quand une source est écartée pour « rien dans
le périmètre » et que le `robots.txt` est permissif, la page de recherche de la
ville doit être essayée AVANT de conclure.

### Maisonette (lamaisonette.fr) — implémentée

- `robots.txt` (vérifié le 2026-09-22) : `/recherche` et `/logements/*` sont
  autorisés ; l'API et les espaces personnels sont exclus, on ne les touche pas.
- Budget : 1 page de recherche + 20 fiches par passage, 3 s entre deux requêtes.
- **Ce sont surtout des baux mobilité meublés de 1 à 10 mois.** Le type de bail
  et le texte sont conservés tels quels plutôt que filtrés à la collecte : les
  critères existants (durée, meublé) écartent eux-mêmes ce qui ne convient pas,
  et un trait inconnu n'écarte jamais.

## Petrova et Meta Immobilier (étude du 2026-09-22)

Deux agences demandées par leur nom. Les deux `robots.txt` sont permissifs :
aucune question de conformité ici, seulement de volume — et les deux réponses
sont opposées.

### Petrova Investissement Immobilier (petrovainvestissement.com) — implémentée

**ELLE TOURNE SUR APIMO**, et c'est tout ce qu'il y avait à trouver. « Design by
Apimo™ » en pied de page, fiches à la forme canonique
`/fr/propriete/location+appartement+nice+<slug>+<réf>` : la fabrique
`sources/apimo/` la sert sans une ligne de parseur. Le fichier de la source fait
quinze lignes, et c'est la bonne mesure d'une source de plus sur une plateforme
déjà servie.

- `robots.txt` (2026-09-22) : n'interdit que `/app_dev.php`, déclare
  `sitemap.xml`. Sitemap index → un seul enfant, `sitemap-1.xml`, 256 URL.
- Volume : **12 locations au sitemap, toutes à Nice** ; 10 sur la page de
  recherche publique.
- **SON SITEMAP TRAÎNE DU VIEUX** : les entrées vont de décembre 2024 à
  septembre 2026, et les références qu'il porte (7 chiffres) ne sont pas celles
  qu'affiche la recherche (8 chiffres). D'où `maxEntryAgeDays: 180`, faute de
  quoi le budget de pages part en 404.
- L'enseigne était déjà dans nos relevés comme un nom que le résolveur
  d'agences ne rattachait à aucune source : les portails la nommaient, nous ne
  la lisions pas.

### Meta Immobilier (meta-immobilier.com) — dormante, aucune location

WordPress, `robots.txt` permissif (seul `/wp-admin/` fermé), deux sitemaps
déclarés. Rien à redire sur l'accès. **Le problème est qu'il n'y a pas de
location.**

Trois mesures concordantes du 2026-09-22 :

1. `property_action_category-sitemap.xml` ne contient qu'une seule URL,
   `/index.php/action/vente/` ;
2. `/index.php/action/location/` répond **404** ;
3. `property-sitemap.xml` liste 31 biens, et la page `/proprietes/` n'offre
   qu'un filtre « Vente », avec des prix de 140 000 à 4 690 000 €.

L'agence se présente comme faisant vente ET location ; son site ne publie que
de la vente. Consignée dans `sources/dormant.ts` avec la sonde qui la réveille :
l'apparition d'une catégorie `/action/location/` à son sitemap de transactions.

## Square Habitat — un refus périmé, et la sonde qui ne pouvait pas le voir (2026-09-22)

Demandée pour son agence de Cagnes-sur-Mer. Elle était **écartée depuis le
2026-08-15** pour un motif qui reste vrai mot pour mot : « `robots.txt`
interdit `/resultat-location` ». Il l'interdit encore aujourd'hui.

**C'est le site qui a changé, pas la règle.** Son `robots.txt` s'ouvre
désormais sur un commentaire sans ambiguïté — « bloquage des pages refonte » —
et les annonces ont déménagé sous `/annonces/…`, que rien n'interdit. Cinq
locations à Nice au relevé du 2026-09-22.

### La leçon, et elle dépasse Square Habitat

**La sonde de réveil re-testait la RAISON du refus, pas la QUESTION qu'il
tranchait.** Elle demandait « est-ce que `/resultat-location` s'est rouvert ? »
alors que la question était « peut-on lire leurs locations ? ». Elle a donc
répondu « toujours refusée » pendant des semaines, en toute bonne foi, pendant
que les annonces étaient lisibles à deux pas.

123Loger avait exactement la même forme : écartée pour « aucune commune du 06
au sitemap », sonde braquée sur le sitemap — alors que les fiches existaient
hors sitemap. Il a fallu qu'une annonce arrive par e-mail pour s'en apercevoir.

**Toute sonde d'un candidat écarté devrait viser l'INVENTAIRE**, pas
l'obstacle : une page de recherche de la commune, une liste, un flux — quelque
chose qui, s'il rend des annonces, prouve que le refus est caduc quel que soit
le chemin qu'elles ont pris.

### Ce que le site donne

- `robots.txt` (relu le 2026-09-22) : ferme `/resultat-location`,
  `/resultat-achat`, `/resultats-agence`, `/api`, `/espace-client/*` et les
  pages `.aspx` de l'ancien site. `/annonces/` reste ouvert. Sitemap déclaré.
- **Tout tient sur la page de liste** — prix, pièces, surface, commune, code
  postal et description entière. Aucune fiche à visiter, une requête par page.
- **Un bloc JSON-LD `Apartment` par bien**, avec l'URL canonique, le code
  postal et les **coordonnées**. Elles valent trente points au dédoublonnage et
  évitent un géocodage : c'est la meilleure donnée de la page.
- **Le site élargit silencieusement.** La page de Cagnes-sur-Mer, qui n'a
  aucune location, rend huit annonces de Nice, Cannes, Pégomas et Mandelieu
  sans le dire autrement qu'en petits caractères. La commune de CHAQUE carte
  est donc vérifiée — et c'est aussi pourquoi deux pages suffisent au lieu de
  treize.
- **Le périmètre se juge sur le NOM de la commune, pas sur le code postal** :
  Nice en a quatre — 06000, 06100, 06200, 06300 — et le périmètre du projet
  n'en nomme qu'un. Trois annonces niçoises sur cinq seraient parties sans un
  mot.
- On ne s'appuie sur aucun attribut `_ngcontent-*` : ce sont des identifiants
  de build Angular, ils changent à chaque déploiement.

## LeSiteImmo (lesiteimmo.com) — implémenté le 2026-09-22

Portail régional PACA, demandé par son nom. **Troisième source de suite dont le
sitemap ment par omission** — après 123Loger et Square Habitat.

### Le sitemap déclare 7 locations niçoises, la page publique en annonce 255

`sitemap-annonces.xml.gz` porte 545 locations, dont **sept** à Nice. La page
`/louer/appartement/nice-06000`, elle, annonce **255 annonces**, vingt-cinq par
page, sur onze pages. Rien n'est caché : c'est le sitemap qui est partiel.

C'est maintenant une règle du projet plutôt qu'une surprise : **un sitemap est
une déclaration, pas un inventaire.** Quand le `robots.txt` est permissif, la
page de recherche de la commune doit être essayée avant toute conclusion.

### Ce que la page donne — la source la mieux renseignée du projet

Un bloc JSON-LD `CollectionPage` dont `mainEntity` est la liste des annonces
affichées. Chacune porte :

| Champ                                            | Ce qu'il vaut ici                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offers.price`                                   | le loyer                                                                                                                                          |
| `itemOffered.numberOfRooms` / `numberOfBedrooms` | pièces et chambres                                                                                                                                |
| `itemOffered.floorSize.value`                    | la surface                                                                                                                                        |
| `description`                                    | le texte **entier**                                                                                                                               |
| `image[]`                                        | les photos                                                                                                                                        |
| `address`                                        | commune et code postal                                                                                                                            |
| **`datePosted`**                                 | **la date de publication, qui manque aux deux tiers de nos fiches** — et c'est elle que le tri « plus récentes » préfère                          |
| **`seller.name`**                                | **l'agence qui publie**, qui rattache l'annonce à sa source d'origine (signal `relayedAgency` du dédoublonnage) et nomme celles qui nous manquent |

Aucune fiche à visiter : une requête par page de résultats, et rien de plus.

### Ce qu'il apporte vraiment, mesuré avant d'implémenter

Sur trois annonces niçoises examinées, **deux venaient d'agences déjà
collectées en direct** — Optimmo et Agir. C'est de la seconde main, et le
dédoublonnage s'en chargera. La troisième venait de **Sixième Avenue**, dont le
site propre répond 403 : pour celle-là, ce portail est le **seul chemin
conforme**. C'est exactement l'apport qu'on attend d'un portail, et c'est
pourquoi il est marqué `relaysListings`.

### Accès

`robots.txt` (vérifié le 2026-09-22) ferme `/recherche`, `/recherche-avancee`,
`/recherche-agences`, `/api`, `/a/`, `/honoraires` et `/index.php`. Les chemins
`/louer/…` et leur pagination `?page=N` restent ouverts.

**Le plafond de pages est délibéré** : six par recherche. Un portail qui se met
à paginer à l'infini — ou à répéter la même page — ne doit pas dépenser tout le
budget d'un passage. Ce qui dépasse est lu au passage suivant.

**Le périmètre se juge sur le NOM de la commune**, comme pour Square Habitat :
Nice a quatre codes postaux, et la pagination mélange parfois les voisines.

## Immobilière ABC — déjà lue, sous un autre nom

Demandée par son nom. `immobiliere-abc.com` est **déjà collecté** depuis le
2026-09-15, sous le nom du cabinet qui l'exploite : **Abyla Bosse**. Même
adresse (4 avenue Georges Clemenceau), même sitemap, même plateforme Apimo.

C'est le test `registry.test.ts` qui l'a dit, en refusant deux sources pour un
même domaine — et c'est exactement à cela qu'il sert.

**Le nom commercial et la raison sociale ne se ressemblent pas toujours**, et
c'est le piège de ce catalogue : une agence peut être lue sous une enseigne que
personne ne prononce. Avant d'ajouter une source, chercher son DOMAINE, pas son
nom.

## ERA Immobilier : Nice ne suffisait pas (`era`)

Le réseau ERA est lu depuis le 2026-09-04, mais sur **la seule page de Nice**.
Or une page de commune ne montre que les biens SITUÉS dans cette commune : les
franchises du réseau qui publient ailleurs dans le périmètre restaient
invisibles, bien que la source existe.

**ERA Maresol, à Cagnes-sur-Mer, était ainsi en tête du relevé des agences
« vues par les portails, sans source directe »** — quinze annonces, dont
quatorze vivantes — alors que nous lisions déjà son réseau. Un trou de
couverture géographique, pas un trou de source.

Relevé du 2026-09-22 sur les treize communes du périmètre :

| Commune              | Annonces |
| -------------------- | -------- |
| Nice                 | 7 à 12   |
| Cagnes-sur-Mer       | 8        |
| Saint-Laurent-du-Var | 5        |
| Villeneuve-Loubet    | 2        |
| Les neuf autres      | 0        |

Trois pages de plus, quinze annonces de plus. Les neuf communes vides ne sont
pas demandées : une page inutile coûte autant qu'une page pleine.

**La leçon vaut pour toutes les sources de réseau** : lire une commune n'est
pas lire une enseigne. Tant qu'une franchise publie dans une commune qu'on ne
demande pas, elle ressortira comme « non suivie ».

## MeilleursAgents — consignée en veille

`robots.txt` accueillant : il n'interdit que la recherche (`/immobilier/recherche/`),
la carte et l'API. `/annonces/` est explicitement ouvert.

**Mais le site entier répond 403**, racine comprise, avec un renvoi vers
`geo.captcha-delivery.com` — DataDome. Rien à contourner : la source est
consignée dans `sources/dormant.ts`.

**Sa sonde vise l'inventaire, pas l'obstacle** : elle demande la page de
locations de Nice, celle que le `robots.txt` autorise. Le jour où elle répond,
il n'y a plus rien à lever — c'est la leçon que Square Habitat a coûtée.

## Immobilière Tichadou (`tichadou`)

Agence niçoise demandée par son nom, **2 rue du Congrès**. `robots.txt`
(vérifié le 2026-09-23) : « Allow: / », sitemap déclaré.

Site **ICS**, comme Forimmo, Drago et l'Agence du Port — mais pas au même
gabarit. Celui-ci ne rend pas `resultat.php` : il embarque ses annonces dans un
**tableau JavaScript**, `var properties = [ … ]`, qui porte tout — titre,
loyer, lien, photo et la **description entière**.

Une seule requête par passage, donc, et aucune fiche à visiter. La description
est la vraie prise : elle détaille le loyer charges comprises, la provision
pour charges, et les **honoraires du locataire avec leur ratio au mètre carré
et la part d'état des lieux** — les deux montants exacts que plafonne la loi
ALUR. Relevé du 2026-09-23 : l'une des quatre annonces facture 13,12 €/m²
d'honoraires là où le plafond de Nice est de 10,09 €/m².

**Ce n'est pas du JSON**, malgré les apparences : les valeurs mêlent guillemets
doubles, apostrophes échappées à la mode JavaScript et champs entre apostrophes
simples. `JSON.parse` s'y casse les dents et `eval` n'entre pas dans ce dépôt —
chaque champ utile est donc lu au coup par coup, ce qui a l'avantage de ne rien
exiger des champs qu'on ignore.

Quatre locations au relevé, toutes à Nice.

## Le contact payant, et où il se trouve

`paidContact` marque les sources qui **facturent la mise en relation**. Ce n'est
pas un jugement : l'annonce reste consultable librement, et c'est bien pour cela
qu'on la collecte. Mais découvrir le péage APRÈS avoir ouvert la fiche est une
déception qu'un mot suffit à éviter, et la fiche le dit avant le clic.

| Source         | Ce que le site demande                                                                                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LocService** | La mise en relation est son métier : ni adresse ni téléphone sur l'annonce.                                                                                                                                                                              |
| **Rentumo**    | Idem.                                                                                                                                                                                                                                                    |
| **Appartager** | Idem, pour la colocation.                                                                                                                                                                                                                                |
| **123Loger**   | « Pour contacter tous les propriétaires […] vous devez créer votre profil locataire et **devenir Premium pour 34 €** » — relevé sur la fiche le 2026-09-23. **Le drapeau manquait**, et c'est la troisième source par le volume (301 annonces vivantes). |

**À NE PAS CONFONDRE AVEC « SANS TÉLÉPHONE NI COURRIEL ».** Beaucoup de sources
n'en publient aucun sans rien faire payer — le contact passe par leur
formulaire ou leur messagerie, gratuitement :

- **ParuVendu** (224 annonces) : formulaire, dans une fenêtre que son
  `robots.txt` ferme ;
- **Studapart** (201) : messagerie, compte gratuit obligatoire ; ce qui se paie,
  ce sont les frais de service **à la réservation**, pas le contact ;
- **MorningCroissant** (94) : messagerie, compte gratuit ; frais de service
  offerts en dessous d'un an de bail ;
- **ImmoJeune** (33) : dépôt et candidature gratuits, c'est même sa raison
  d'être dans notre liste ;
- **LeSiteImmo**, **Bien'ici** : formulaire vers l'agence, gratuit.

Le relevé qui sépare les deux familles est simple et se refait d'une requête :
compter, par source, les occurrences vivantes **sans téléphone ni courriel**.
Il donne la liste des sources à examiner ; lesquelles font payer, seule leur
page le dit.
