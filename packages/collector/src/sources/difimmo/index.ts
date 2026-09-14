/**
 * Source : Diffusion Immobilière (difimmo.com) — Nice. Plateforme Apimo :
 * adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 2 locations à Nice.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const difimmoScraper = makeApimoScraper({
  id: 'difimmo',
  name: 'Diffusion Immobilière',
  domain: 'difimmo.com',
  sitemapUrl: 'https://difimmo.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
