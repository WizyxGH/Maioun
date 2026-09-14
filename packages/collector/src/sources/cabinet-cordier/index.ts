/**
 * Source : Cabinet Cordier (cabinetcordier.com) — 27 rue Arson et 64 boulevard
 * Virgile Barel, Nice. Apimo ancien schéma : `../apimo/list-scraper.ts` ; son
 * sitemap ne porte que de vieilles fiches sans ville.
 *
 * Vérifié le 2026-09-14 : robots.txt n'interdit que /app_dev.php. 5 locations à
 * Nice (dont un parking et un local).
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const cabinetCordierScraper = makeApimoListScraper({
  id: 'cabinet-cordier',
  name: 'Cabinet Cordier',
  domain: 'cabinetcordier.com',
  listUrls: ['https://www.cabinetcordier.com/fr/locations'],
});
