/**
 * Source : Agence Longchamp (agencelongchamp.com) — agence niçoise sur la plateforme
 * Apimo/Cello (§47).
 *
 * Petit volume, dominé par les commerces ; une dizaine de logements.
 *
 * Vérifié le 2026-09-05 avec `scripts/probe-agency.mjs` : robots.txt permissif
 * (seul `/app_dev.php` interdit), signature Apimo confirmée, 10 locations
 * dans les communes cibles au sitemap.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const agenceLongchampScraper = makeApimoScraper({
  id: 'agence-longchamp',
  name: 'Agence Longchamp',
  domain: 'agencelongchamp.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Elone-v2/4750/media/808f85d19582189b003523802646b0bb.png',
  sitemapUrl: 'https://agencelongchamp.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://agencelongchamp.com/fr/location-2'],
});
