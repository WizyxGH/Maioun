/**
 * Source : Diffusion Immobilière (difimmo.com) — Nice. Plateforme Apimo :
 * adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 2 locations à Nice.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const difimmoScraper = makeApimoScraper({
  id: 'difimmo',
  name: 'Diffusion Immobilière',
  domain: 'difimmo.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Elone-v2/4240/media/20b538e888cebe8dc8131bf493630b33.png',
  sitemapUrl: 'https://difimmo.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://difimmo.com/fr/locations'],
});
