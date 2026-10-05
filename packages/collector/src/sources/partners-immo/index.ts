/**
 * Source : Partners Immo (partners-immo.fr) — agence niçoise sur la plateforme
 * Apimo/Cello (§47).
 *
 * Appartements et maisons.
 *
 * Vérifié le 2026-09-05 avec `scripts/probe-agency.mjs` : robots.txt permissif
 * (seul `/app_dev.php` interdit), signature Apimo confirmée, 33 locations
 * dans les communes cibles au sitemap.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const partnersImmoScraper = makeApimoScraper({
  id: 'partners-immo',
  name: 'Partners Immo',
  domain: 'partners-immo.fr',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Cello/2919/media/0e78952c85a99824121bec7557a663b4.png',
  sitemapUrl: 'https://partners-immo.fr/sitemap.xml',
  listUrls: ['https://partners-immo.fr/fr/locations'],
  citySlugs: NICE_AREA_SLUGS,
});
