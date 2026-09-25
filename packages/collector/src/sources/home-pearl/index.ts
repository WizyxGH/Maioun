/**
 * Source : Home Pearl (homepearl.immo) — 16 rue Foncet, 06000 Nice. Plateforme
 * Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 5 locations en ligne à Nice ; le sitemap en garde 104, que le filtre d’âge
 * et la détection « loué » écartent.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const homePearlScraper = makeApimoScraper({
  id: 'home-pearl',
  name: 'Home Pearl',
  domain: 'homepearl.immo',
  agencyContact: { address: { street: '16 rue Foncet', postalCode: '06000', city: 'Nice' } },
  sitemapUrl: 'https://www.homepearl.immo/sitemap.xml',
  listUrls: ['https://www.homepearl.immo/fr/trouver'],
  citySlugs: NICE_AREA_SLUGS,
});
