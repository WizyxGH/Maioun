/**
 * Source : Agence Privilège (agenceprivilege.com) — Apimo ancien schéma, voir
 * `../apimo/list-scraper.ts`. robots.txt vérifié le 2026-08-25 : permissif.
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const privilegeScraper = makeApimoListScraper({
  id: 'privilege',
  name: 'Agence Privilège',
  domain: 'agenceprivilege.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Zenia/803/media/edd34909fa67936a92ba460a5d2bf92a.png',
  listUrls: ['https://www.agenceprivilege.com/fr/locations'],
});
