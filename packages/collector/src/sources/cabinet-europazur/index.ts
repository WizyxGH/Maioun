/**
 * Source : Cabinet Europazur (europazur.fr) — 9 boulevard Victor Hugo, 06000
 * Nice (siège à Cagnes-sur-Mer). Apimo ancien schéma (`/fr/propriété/{id}`) :
 * `../apimo/list-scraper.ts`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php. 2 fiches sur
 * /fr/locations, deux places de parking (Villeneuve-Loubet, Cagnes-sur-Mer).
 * Leur JSON-LD est typé `Product`, d'où un repli HTML sans commune ; un
 * logement serait typé `Apartment` ou `House` et lu en entier.
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const cabinetEuropazurScraper = makeApimoListScraper({
  id: 'cabinet-europazur',
  name: 'Cabinet Europazur',
  domain: 'europazur.fr',
  agencyContact: {
    phone: '04 92 02 50 00', // secret-scan-ignore
    email: 'contact@europazur.fr', // secret-scan-ignore
    address: { street: '9 boulevard Victor Hugo', postalCode: '06000', city: 'Nice' },
  },
  listUrls: ['https://europazur.fr/fr/locations'],
});
