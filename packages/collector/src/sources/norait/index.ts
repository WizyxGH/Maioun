/**
 * Source : Norait Immobilier (norait-immobilier.fr) — 20 rue Verdi, 06000 Nice.
 * Apimo ancien schéma (`/fr/propriété/{id}`) : `../apimo/list-scraper.ts`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php. La liste des
 * locations est `/fr/location`, au singulier (`/fr/locations` rend un 404).
 * « Aucun produit » ce jour-là ; gardée pour les biens à venir.
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const noraitScraper = makeApimoListScraper({
  id: 'norait',
  name: 'Norait Immobilier',
  domain: 'norait-immobilier.fr',
  agencyContact: {
    phone: '04 93 81 07 35', // secret-scan-ignore
    address: { street: '20 rue Verdi', postalCode: '06000', city: 'Nice' },
  },
  listUrls: ['https://norait-immobilier.fr/fr/location'],
});
