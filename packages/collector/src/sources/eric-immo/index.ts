/**
 * Source : Eric Immo (eric-immo.com) — 173 boulevard de la Madeleine, 06000
 * Nice. Plateforme Apimo/Cello : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php, sitemap
 * déclaré. 17 fiches de location dans la zone (Nice, Saint-Laurent-du-Var),
 * dont deux locaux commerciaux écartés par l'adaptateur et deux garages. Le
 * sitemap garde de vieilles fiches, d'où la limite d'âge courte.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const ericImmoScraper = makeApimoScraper({
  id: 'eric-immo',
  name: 'Eric Immo',
  domain: 'eric-immo.com',
  sitemapUrl: 'https://www.eric-immo.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://www.eric-immo.com/fr/locations'],
  maxEntryAgeDays: 120,
  agencyContact: {
    phone: '04 92 15 07 14', // secret-scan-ignore
    email: 'eric.immo06@gmail.com', // secret-scan-ignore
    address: { street: '173 boulevard de la Madeleine', postalCode: '06000', city: 'Nice' },
  },
});
