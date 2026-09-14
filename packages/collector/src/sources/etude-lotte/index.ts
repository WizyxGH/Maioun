/**
 * Source : Étude Lotte (etudelotte.com) — 36 avenue Paul Arène, 06000 Nice.
 * Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 1 location en ligne à Nice ; le sitemap en garde 90, dont 22 de moins d’un
 * an.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const etudeLotteScraper = makeApimoScraper({
  id: 'etude-lotte',
  name: 'Étude Lotte',
  domain: 'etudelotte.com',
  sitemapUrl: 'https://etudelotte.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
