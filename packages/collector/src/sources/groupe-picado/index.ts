/**
 * Source : Groupe Cabinet Picado (groupepicado.com) — 12 avenue Malausséna,
 * 06000 Nice. Apimo ancien schéma : `../apimo/list-scraper.ts`.
 *
 * Vérifié le 2026-09-14 : robots.txt n'interdit que /app_dev.php. 9 fiches sur
 * une page, Nice ×8 (5 appartements, 3 locaux) et Peillon.
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const groupePicadoScraper = makeApimoListScraper({
  id: 'groupe-picado',
  name: 'Groupe Picado',
  domain: 'groupepicado.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Altera/1953/media/3ae8a26c422ce1325306b929575007c0.png',
  agencyContact: { address: { street: '12 avenue Malausséna', postalCode: '06000', city: 'Nice' } },
  listUrls: ['https://groupepicado.com/fr/locations'],
});
