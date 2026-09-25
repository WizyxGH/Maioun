/**
 * Source : Sambroni Immobilier (agencesambroni.com) — 186 avenue de Pessicart,
 * 06100 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 5 appartements à Nice.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const sambroniScraper = makeApimoScraper({
  id: 'sambroni',
  name: 'Sambroni Immobilier',
  domain: 'agencesambroni.com',
  agencyContact: {
    address: { street: '186 avenue de Pessicart', postalCode: '06100', city: 'Nice' },
  },
  sitemapUrl: 'https://agencesambroni.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://agencesambroni.com/fr/louer'],
});
