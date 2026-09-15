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
  agencyContact: {
    address: { street: '78 boulevard Napoléon III', postalCode: '06200', city: 'Nice' },
  },
  listUrls: [
    'https://www.cabinet-reynier.com/fr/locations',
    'https://www.cabinet-reynier.com/fr/locations?page=2',
  ],
});
