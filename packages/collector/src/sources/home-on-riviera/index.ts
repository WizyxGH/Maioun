/**
 * Source : Home on Riviera (homeonriviera.com) — 3 rue Cronstadt, 06000 Nice.
 * Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php, sitemap
 * déclaré. Aucune fiche de location au sitemap ce jour-là (48 ventes) ;
 * gardée pour les biens à venir.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const homeOnRivieraScraper = makeApimoScraper({
  id: 'home-on-riviera',
  name: 'Home on Riviera',
  domain: 'homeonriviera.com',
  sitemapUrl: 'https://homeonriviera.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  agencyContact: {
    phone: '04 93 82 29 51', // secret-scan-ignore
    email: 'homeonriviera06@gmail.com', // secret-scan-ignore
    address: { street: '3 rue Cronstadt', postalCode: '06000', city: 'Nice' },
  },
});
