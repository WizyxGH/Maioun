/**
 * Source : De Vita Immobilier (devita.immo) — 52 rue Gioffredo, 06000 Nice.
 * Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 2 locations à Nice.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const deVitaScraper = makeHektorScraper({
  id: 'de-vita',
  name: 'De Vita Immobilier',
  domain: 'devita.immo',
  logo: 'https://www.devita.immo/images/favicon.png',
  listUrls: ['https://www.devita.immo/location/1'],
});
