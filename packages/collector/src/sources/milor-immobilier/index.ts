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
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Zenia/2902/media/36888d381f56038c397c82742c0f9d70.png',
  agencyContact: {
    address: { street: '50 boulevard Joseph Garnier', postalCode: '06000', city: 'Nice' },
  },
  listUrls: ['https://milorimmobilier.com/fr/louer'],
});
