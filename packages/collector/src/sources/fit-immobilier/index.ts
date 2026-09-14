/**
 * Source : FIT Immobilier (fit-immobilier.com) — 1 avenue de la Lanterne,
 * 06200 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 3 locations à Nice (dont un parking et une colocation).
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const fitImmobilierScraper = makeApimoScraper({
  id: 'fit-immobilier',
  name: 'FIT Immobilier',
  domain: 'fit-immobilier.com',
  sitemapUrl: 'https://fit-immobilier.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
