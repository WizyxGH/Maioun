/**
 * Source : Acropolis Immobilier (acropolisimmo.com) — agence niçoise sur la plateforme
 * Apimo/Cello (§47).
 *
 * Appartements, parkings et locaux : volume régulier.
 *
 * Vérifié le 2026-09-05 avec `scripts/probe-agency.mjs` : robots.txt permissif
 * (seul `/app_dev.php` interdit), signature Apimo confirmée, 49 locations
 * dans les communes cibles au sitemap.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const acropolisImmoScraper = makeApimoScraper({
  id: 'acropolis-immo',
  name: 'Acropolis Immobilier',
  domain: 'acropolisimmo.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Haku-v2/4050/media/194b024190aaae0b22b1df755c90b24f.png',
  agencyContact: { address: { street: '47 rue Arson', postalCode: '06300', city: 'Nice' } },
  sitemapUrl: 'https://acropolisimmo.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://acropolisimmo.com/fr/location'],
  maxDetailsBackfill: 25,
});
