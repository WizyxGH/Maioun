/**
 * Source : Cabinet AGIR (agir.immo) — 2 rue Maréchal Joffre, 06000 Nice.
 * Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 2 locations (Nice, Le Rouret). Écartée le 2026-09-05 pour son volume : toute
 * agence qui loue dans la zone est désormais gardée.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const agirScraper = makeHektorScraper({
  id: 'agir',
  name: 'Cabinet AGIR',
  domain: 'agir.immo',
  logo: 'https://www.agir.immo/images/favicon.png',
  listUrls: ['https://www.agir.immo/location/1'],
});
