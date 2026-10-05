/**
 * Source : Reutter Invest (reutterinvest.fr) — 45 rue Rossini, 06000 Nice.
 * Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 28 locations à Nice au sitemap, dont 15 de 2024-2025.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const reutterInvestScraper = makeApimoScraper({
  id: 'reutter-invest',
  name: 'Reutter Invest',
  domain: 'reutterinvest.fr',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Elone/3640/media/bbeb303df356ddb664cb38dfde6c64f7.png',
  agencyContact: { address: { street: '45 rue Rossini', postalCode: '06000', city: 'Nice' } },
  sitemapUrl: 'https://reutterinvest.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://reutterinvest.fr/fr/locations'],
});
