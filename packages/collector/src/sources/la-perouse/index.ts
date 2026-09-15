/**
 * Source : La Pérouse Immobilier (laperouse-immobilier.com) — 17 rue Alfred
 * Mortier, 06000 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php, sitemap
 * déclaré. 27 fiches de location au sitemap : Nice surtout, La Trinité, Contes
 * et Saint-André-de-la-Roche, plus quelques parkings et locaux.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const laPerouseScraper = makeApimoScraper({
  id: 'la-perouse',
  name: 'La Pérouse Immobilier',
  domain: 'laperouse-immobilier.com',
  agencyContact: {
    phone: '04 93 85 77 30', // secret-scan-ignore
    address: { street: '17 rue Alfred Mortier', postalCode: '06000', city: 'Nice' },
  },
  sitemapUrl: 'https://laperouse-immobilier.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
