/**
 * Source : Joseph Garnier Real Estate (josephgarnier.fr) — 6 boulevard Joseph
 * Garnier, 06000 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 5 locations à Nice (4 appartements, un parking).
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const josephGarnierScraper = makeApimoScraper({
  id: 'joseph-garnier',
  name: 'Joseph Garnier Real Estate',
  domain: 'josephgarnier.fr',
  agencyContact: {
    address: { street: '6 boulevard Joseph Garnier', postalCode: '06000', city: 'Nice' },
  },
  sitemapUrl: 'https://www.josephgarnier.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://www.josephgarnier.fr/fr/locations'],
});
