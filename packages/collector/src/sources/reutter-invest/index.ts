/**
 * Source : Reutter Invest (reutterinvest.fr) — 45 rue Rossini, 06000 Nice.
 * Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 28 locations à Nice au sitemap, dont 15 de 2024-2025.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const reutterInvestScraper = makeApimoScraper({
  id: 'reutter-invest',
  name: 'Reutter Invest',
  domain: 'reutterinvest.fr',
  agencyContact: { address: { street: '45 rue Rossini', postalCode: '06000', city: 'Nice' } },
  sitemapUrl: 'https://reutterinvest.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
