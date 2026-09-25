/**
 * Source : 5 Stars Holiday House (fivestarsholidayhouserealestate.com) — 40
 * rue de la Buffa, 06000 Nice (Sima Immobilier). Plateforme Apimo : adaptateur
 * générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 5 locations à Nice (une à l’année, trois étudiantes, un parking). Le
 * saisonnier vit sur un autre site, jamais lu.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const fiveStarsScraper = makeApimoScraper({
  id: 'five-stars',
  name: '5 Stars Holiday House',
  domain: 'fivestarsholidayhouserealestate.com',
  agencyContact: { address: { street: '40 rue de la Buffa', postalCode: '06000', city: 'Nice' } },
  sitemapUrl: 'https://fivestarsholidayhouserealestate.com/sitemap.xml',
  listUrls: ['https://fivestarsholidayhouserealestate.com/fr/locations'],
  citySlugs: NICE_AREA_SLUGS,
});
