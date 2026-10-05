/**
 * Source : Personal Immo (personalimmo.fr) — agence niçoise sur la plateforme
 * Apimo/Cello (§47).
 *
 * Identifiée par l'inventaire Apimo du 2026-08-17. robots.txt revérifié le
 * 2026-08-17 : signature Apimo exacte. ~16 locations à Nice dans le sitemap au
 * moment de l'étude.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const personalimmoScraper = makeApimoScraper({
  id: 'personalimmo',
  name: 'Personal Immo',
  domain: 'personalimmo.fr',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Cello/2839/media/34b55a6c2edd556f155ae47397c8b38b.png',
  sitemapUrl: 'https://personalimmo.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://personalimmo.fr/fr/locations'],
});
