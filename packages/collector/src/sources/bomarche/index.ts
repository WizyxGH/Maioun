/**
 * Source : BôMarché by Lambda Immobilier (bomarche.fr) — 14 avenue
 * Borriglione, 06000 Nice. Plateforme Apimo : adaptateur générique
 * `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 4 locations à Nice.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const bomarcheScraper = makeApimoScraper({
  id: 'bomarche',
  name: 'BôMarché by Lambda Immobilier',
  domain: 'bomarche.fr',
  sitemapUrl: 'https://bomarche.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
