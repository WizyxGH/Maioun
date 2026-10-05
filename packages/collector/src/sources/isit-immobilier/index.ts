/**
 * Source : ISIT Immobilier (isitimmo.com) — 26 rue de la Buffa, 06000 Nice.
 * Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php, sitemap
 * déclaré. 5 locations à Nice (studios et deux-pièces), descriptions complètes.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const isitImmobilierScraper = makeApimoScraper({
  id: 'isit-immobilier',
  name: 'ISIT Immobilier',
  domain: 'isitimmo.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Elone/3726/media/97e7038b1a7bc3c48e202e8089c35fd2.jpeg',
  agencyContact: {
    phone: '04 93 16 80 62', // secret-scan-ignore
    email: 'info@isitimmo.com', // secret-scan-ignore
    address: { street: '26 rue de la Buffa', postalCode: '06000', city: 'Nice' },
  },
  sitemapUrl: 'https://isitimmo.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://isitimmo.com/fr/locations'],
});
