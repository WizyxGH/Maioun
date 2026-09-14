/**
 * Source : Immobilier 2 Nice (immobilier2nice.com) — 1 boulevard Auguste
 * Raynaud, 06100 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 31 locations ciblées au sitemap, surtout de 2025 : Bien’ici n’en montre que
 * 2 en ligne.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const immobilier2niceScraper = makeApimoScraper({
  id: 'immobilier2nice',
  name: 'Immobilier 2 Nice',
  domain: 'immobilier2nice.com',
  sitemapUrl: 'https://immobilier2nice.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
