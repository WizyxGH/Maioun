/**
 * Source : Liberty Agency (agence-liberty.com) — 136 boulevard Gambetta, 06000
 * Nice. Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 3 locations à Nice.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const libertyAgencyScraper = makeHektorScraper({
  id: 'liberty-agency',
  name: 'Liberty Agency',
  domain: 'agence-liberty.com',
  logo: 'https://www.agence-liberty.com/images/favicon.png',
  listUrls: ['https://www.agence-liberty.com/location/1'],
});
