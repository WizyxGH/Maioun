/**
 * Source : Agence Riviera Real Estate (agenceriviera.com) — 12 rue Cassini,
 * 06300 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 2 locations en ligne à Nice.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const agenceRivieraScraper = makeApimoScraper({
  id: 'agence-riviera',
  name: 'Agence Riviera Real Estate',
  domain: 'agenceriviera.com',
  agencyContact: { address: { street: '12 rue Cassini', postalCode: '06300', city: 'Nice' } },
  sitemapUrl: 'https://agenceriviera.com/sitemap.xml',
  listUrls: ['https://agenceriviera.com/fr/locations'],
  citySlugs: NICE_AREA_SLUGS,
});
