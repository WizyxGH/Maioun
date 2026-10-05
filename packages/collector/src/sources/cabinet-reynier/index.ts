/**
 * Source : Cabinet Reynier / ICF Immobilière Constellations de Fabron
 * (cabinet-reynier.com) — 78 boulevard Napoléon III, 06200 Nice. Apimo ancien
 * schéma : `../apimo/list-scraper.ts`.
 *
 * Vérifié le 2026-09-14 : robots.txt n'interdit que /app_dev.php. 11 fiches sur
 * deux pages de liste, dont 10 dans la zone (Nice ×7, Cap-d'Ail, Cagnes,
 * Saint-Laurent-du-Var).
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const cabinetReynierScraper = makeApimoListScraper({
  id: 'cabinet-reynier',
  name: 'Cabinet Reynier',
  domain: 'cabinet-reynier.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Zenia/774/media/23db7352da390575aa22fbce081758ec.png',
  agencyContact: {
    address: { street: '78 boulevard Napoléon III', postalCode: '06200', city: 'Nice' },
  },
  listUrls: [
    'https://www.cabinet-reynier.com/fr/locations',
    'https://www.cabinet-reynier.com/fr/locations?page=2',
  ],
});
