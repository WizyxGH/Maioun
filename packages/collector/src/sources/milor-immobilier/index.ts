/**
 * Source : Milor Immobilier (milorimmobilier.com) — 50 boulevard Joseph
 * Garnier, 06000 Nice. Apimo à l'ancien schéma d'URL : adaptateur
 * `../apimo/list-scraper.ts`, liste sur /fr/louer.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php.
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const milorImmobilierScraper = makeApimoListScraper({
  id: 'milor-immobilier',
  name: 'Milor Immobilier',
  domain: 'milorimmobilier.com',
  agencyContact: {
    address: { street: '50 boulevard Joseph Garnier', postalCode: '06000', city: 'Nice' },
  },
  listUrls: ['https://milorimmobilier.com/fr/louer'],
});
