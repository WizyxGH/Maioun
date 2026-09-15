/**
 * Source : Solissimmo (solissimmo.fr) — 30 rue Alphonse Karr, 06000 Nice.
 * Apimo ancien schéma (`/fr/propriété/{id}`) : `../apimo/list-scraper.ts`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php. solissimmo.com
 * n'est qu'une vitrine sans annonces. Une location à Nice (Vauban) au relevé.
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const solissimmoScraper = makeApimoListScraper({
  id: 'solissimmo',
  name: 'Solissimmo',
  domain: 'solissimmo.fr',
  agencyContact: {
    phone: '04 93 88 40 22', // secret-scan-ignore
    email: 'solissimmo@yahoo.fr', // secret-scan-ignore
    address: { street: '30 rue Alphonse Karr', postalCode: '06000', city: 'Nice' },
  },
  listUrls: ['https://solissimmo.fr/fr/locations'],
});
