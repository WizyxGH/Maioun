/**
 * Source : A Alliance Conseil Immobilier (allianceconseilimmo.com) — 3 rue
 * Auguste Gal, 06300 Nice. Plateforme Apimo : adaptateur générique
 * `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 25 locations à Nice au sitemap (19 appartements, 6 parkings ou caves).
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const allianceConseilScraper = makeApimoScraper({
  id: 'alliance-conseil',
  name: 'A Alliance Conseil Immobilier',
  domain: 'allianceconseilimmo.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Elone/3295/media/807e6eaf70aec148273789ea0ebc0df7.png',
  agencyContact: { address: { street: '3 rue Auguste Gal', postalCode: '06300', city: 'Nice' } },
  sitemapUrl: 'https://allianceconseilimmo.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://allianceconseilimmo.com/fr/locations'],
});
