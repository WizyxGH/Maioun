/**
 * Source : Immobilière Camo (immobiliere-camo.fr) — 26 rue Arson, 06300 Nice.
 * Apimo à l'ancien schéma d'URL : adaptateur `../apimo/list-scraper.ts`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php.
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const immobiliereCamoScraper = makeApimoListScraper({
  id: 'immobiliere-camo',
  name: 'Immobilière Camo',
  domain: 'immobiliere-camo.fr',
  agencyContact: {
    phone: '04 22 13 07 85', // secret-scan-ignore
    email: 'contact@mynice-immo.fr', // secret-scan-ignore
    address: { street: '26 rue Arson', postalCode: '06300', city: 'Nice' },
  },
  listUrls: ['https://immobiliere-camo.fr/fr/locations'],
});
