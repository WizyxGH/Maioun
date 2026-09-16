/**
 * Source : Agence Privilège (agenceprivilege.com) — Apimo ancien schéma, voir
 * `../apimo/list-scraper.ts`. robots.txt vérifié le 2026-08-25 : permissif.
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const privilegeScraper = makeApimoListScraper({
  id: 'privilege',
  name: 'Agence Privilège',
  domain: 'agenceprivilege.com',
  listUrls: ['https://www.agenceprivilege.com/fr/locations'],
});
