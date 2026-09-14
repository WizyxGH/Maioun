/**
 * Source : Sambroni Immobilier (agencesambroni.com) — 186 avenue de Pessicart,
 * 06100 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 5 appartements à Nice.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const sambroniScraper = makeApimoScraper({
  id: 'sambroni',
  name: 'Sambroni Immobilier',
  domain: 'agencesambroni.com',
  sitemapUrl: 'https://agencesambroni.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
