/**
 * Source : Cap Sud Immobilier (capsud-immobilier.fr) — 256 avenue de la
 * Californie, 06200 Nice. Apimo ancien schéma (`/fr/propriété/{id}`) :
 * `../apimo/list-scraper.ts`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php. La liste
 * `/fr/locations` mêle Nice et le bureau de Puget-Théniers (hors zone, écarté au
 * scoring) ; ce jour-là, à Nice, seulement un garage : suivie pour les logements
 * à venir.
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const capSudImmobilierScraper = makeApimoListScraper({
  id: 'cap-sud-immobilier',
  name: 'Cap Sud Immobilier',
  domain: 'capsud-immobilier.fr',
  agencyContact: {
    phone: '04 93 18 99 34', // secret-scan-ignore
    email: 'capsud.nice@hotmail.com', // secret-scan-ignore
    address: { street: '256 avenue de la Californie', postalCode: '06200', city: 'Nice' },
  },
  listUrls: ['https://capsud-immobilier.fr/fr/locations'],
});
