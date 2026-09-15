/**
 * Source : Cegestim (cegestim.fr) — 8 rue Gioffredo, 06000 Nice. Apimo à
 * l'ancien schéma d'URL : adaptateur `../apimo/list-scraper.ts`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php.
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const cegestimScraper = makeApimoListScraper({
  id: 'cegestim',
  name: 'Cegestim',
  domain: 'cegestim.fr',
  agencyContact: {
    phone: '04 92 47 88 10', // secret-scan-ignore
    email: 'location@cegestim.fr', // secret-scan-ignore
    address: { street: '8 rue Gioffredo', postalCode: '06000', city: 'Nice' },
  },
  listUrls: ['https://cegestim.fr/fr/locations'],
});
