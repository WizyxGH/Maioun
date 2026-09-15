/**
 * Source : Coccimmo (coccimmo.com) — 143 boulevard René Cassin, 06200 Nice.
 * Plateforme Apimo : `../apimo/list-scraper.ts`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php. Le sitemap
 * garde des locations disparues depuis des années (13 fiches, aucune en
 * ligne) : on part donc de /fr/locations, vide au relevé.
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const coccimmoScraper = makeApimoListScraper({
  id: 'coccimmo',
  name: 'Coccimmo',
  domain: 'coccimmo.com',
  agencyContact: {
    phone: '06 86 93 72 48', // secret-scan-ignore
    email: 'info@coccimmo.com', // secret-scan-ignore
    address: { street: '143 boulevard René Cassin', postalCode: '06200', city: 'Nice' },
  },
  listUrls: ['https://coccimmo.com/fr/locations'],
  notes:
    'Apimo, liens /fr/propriete/location+…. robots.txt permissif (seul /app_dev.php ' +
    'interdit). Sitemap non purgé : locations lues sur /fr/locations (SSR), fiches ' +
    'nouvelles visitées (JSON-LD Apimo).',
});
