/**
 * Source : Nice Premium Immobilier (nice-premium-immobilier.com) — 21 rue
 * Michel-Ange, 06100 Nice. Plateforme Apimo : adaptateur générique
 * `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 1 location à Nice. Le site n’a pas de page de locations : le sitemap est la
 * seule voie.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const nicePremiumScraper = makeApimoScraper({
  id: 'nice-premium',
  name: 'Nice Premium Immobilier',
  domain: 'nice-premium-immobilier.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Cello/2767/media/d372d915d8ebfe5ac050132e4125c7b0.png',
  agencyContact: { address: { street: '21 rue Michel-Ange', postalCode: '06100', city: 'Nice' } },
  sitemapUrl: 'https://nice-premium-immobilier.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
