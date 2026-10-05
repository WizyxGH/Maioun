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
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Stax/2152/media/c90aa99a4122c183040b30a7ebe0af5e.png',
  agencyContact: {
    phone: '04 93 18 99 34', // secret-scan-ignore
    email: 'capsud.nice@hotmail.com', // secret-scan-ignore
    address: { street: '256 avenue de la Californie', postalCode: '06200', city: 'Nice' },
  },
  listUrls: ['https://capsud-immobilier.fr/fr/locations'],
});
