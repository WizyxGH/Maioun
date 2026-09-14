/**
 * Source : Postillon Immobilier (postillon-immobilier.fr) — 8 avenue Baquis,
 * Nice (Postillon Patrimoine). Apimo ancien schéma : `../apimo/list-scraper.ts`.
 *
 * Vérifié le 2026-09-14 : robots.txt n'interdit que /app_dev.php. 3 locations à
 * Nice (deux appartements, un parking).
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const postillonScraper = makeApimoListScraper({
  id: 'postillon',
  name: 'Postillon Immobilier',
  domain: 'postillon-immobilier.fr',
  listUrls: ['https://www.postillon-immobilier.fr/fr/locations'],
});
