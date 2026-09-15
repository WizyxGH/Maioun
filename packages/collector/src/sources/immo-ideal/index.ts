/**
 * Source : Immo Idéal (immo-ideal.fr) — 24 avenue de Saint-Sylvestre, 06100
 * Nice. Apimo à fiches `/fr/propriete/{id}` : `../apimo/list-scraper.ts`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php. Aucune
 * location sur /fr/locations au relevé (bandeau « aucun produit »).
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const immoIdealScraper = makeApimoListScraper({
  id: 'immo-ideal',
  name: 'Immo Idéal',
  domain: 'immo-ideal.fr',
  agencyContact: {
    phone: '04 93 17 02 72', // secret-scan-ignore
    address: { street: '24 avenue de Saint-Sylvestre', postalCode: '06100', city: 'Nice' },
  },
  listUrls: ['https://immo-ideal.fr/fr/locations'],
});
