/**
 * Source : Kalliste Immo Conseil (kalliste-immo-conseil.com) — 27 boulevard
 * Victor Hugo, 06000 Nice. Apimo à l'ancien schéma d'URL : adaptateur
 * `../apimo/list-scraper.ts`, liste sur /fr/louer (pas de /fr/locations).
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php.
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const kallisteImmoConseilScraper = makeApimoListScraper({
  id: 'kalliste-immo-conseil',
  name: 'Kalliste Immo Conseil',
  domain: 'kalliste-immo-conseil.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Zenia/1290/media/22271bc09b36f04c68b5bd03d100850b.png',
  agencyContact: {
    phone: '04 93 88 14 15', // secret-scan-ignore
    email: 'direction@kic.immo', // secret-scan-ignore
    address: { street: '27 boulevard Victor Hugo', postalCode: '06000', city: 'Nice' },
  },
  listUrls: ['https://kalliste-immo-conseil.com/fr/louer'],
});
