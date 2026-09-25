/**
 * Source : PHT Real Estate (phtrealestate.com) — 15 rue Biscarra, 06000 Nice
 * (Patrick Taboni). Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 39 appartements ciblés au sitemap (Nice 37, Cagnes 2), dont 26 de 2024-2025
 * que le filtre d’âge et la détection « loué » absorbent.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const phtRealEstateScraper = makeApimoScraper({
  id: 'pht-real-estate',
  name: 'PHT Real Estate',
  domain: 'phtrealestate.com',
  agencyContact: { address: { street: '15 rue Biscarra', postalCode: '06000', city: 'Nice' } },
  sitemapUrl: 'https://phtrealestate.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://phtrealestate.com/fr/locations'],
});
