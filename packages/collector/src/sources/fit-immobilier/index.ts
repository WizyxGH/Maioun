/**
 * Source : FIT Immobilier (fit-immobilier.com) — 1 avenue de la Lanterne,
 * 06200 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 3 locations à Nice (dont un parking et une colocation).
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const fitImmobilierScraper = makeApimoScraper({
  id: 'fit-immobilier',
  name: 'FIT Immobilier',
  domain: 'fit-immobilier.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Cello/1705/media/08c2945d04867f779be1e9fa35c57836.png',
  agencyContact: {
    address: { street: '1 avenue de la Lanterne', postalCode: '06200', city: 'Nice' },
  },
  sitemapUrl: 'https://fit-immobilier.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://fit-immobilier.com/fr/locations'],
});
