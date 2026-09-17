/**
 * Source : Immobilière GTI (immobilieregti.com) — 35 rue Pastorelli, Nice ;
 * franchise Orpi à sept agences. `immonice.com` y redirige. Plateforme La Boîte
 * Immo : adaptateur générique `../hektor/`.
 *
 * robots.txt relu le 2026-09-17 : standard de la plateforme (interdits
 * `/stats/`, `/phpmv2/`, `/fonctions/`, `/templates/`, `/admin/`, puis
 * `Allow: /` et sitemap déclaré). Rien ne ferme `/a-louer/`.
 *
 * L'AGENCE PUBLIE AILLEURS CE QU'ELLE NE MET PAS CHEZ ELLE, et ce n'est pas un
 * défaut de collecte. Relevé du 2026-09-17 : son site porte 15 locations sur
 * deux pages — la pagination le dit, et son sitemap de 277 fiches ne connaît
 * rien d'autre —, et l'adaptateur les rend toutes les quinze. Les 35 autres que
 * nous voyons sous son nom viennent d'orpi.com et de Bien'ici ; aucune de leurs
 * rues (Saint-Siagre, Bottero, Cernuschi, Vismara, Frémont, Schuman…) n'existe
 * nulle part sur immobilieregti.com. La source directe est exhaustive de ce que
 * l'agence publie ; c'est orpi.com qui porte le reste de son inventaire, et la
 * source Orpi le lit déjà commune par commune.
 *
 * Une seule adresse déclarée : la pagination du site est suivie par
 * l'adaptateur générique, et la page 2 est lue par lui.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const igtiScraper = makeHektorScraper({
  id: 'igti',
  name: 'Immobilière GTI',
  domain: 'immobilieregti.com',
  listUrls: ['https://www.immobilieregti.com/a-louer/1'],
});
