/**
 * Source : BôMarché by Lambda Immobilier (bomarche.fr) — 14 avenue
 * Borriglione, 06000 Nice. Plateforme Apimo : adaptateur générique
 * `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 4 locations à Nice.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const bomarcheScraper = makeApimoScraper({
  id: 'bomarche',
  name: 'BôMarché by Lambda Immobilier',
  domain: 'bomarche.fr',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Stax/3961/media/7a05d1272a1418383e7731ac6251a037.png',
  agencyContact: {
    address: { street: '14 avenue Borriglione', postalCode: '06000', city: 'Nice' },
  },
  sitemapUrl: 'https://bomarche.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://bomarche.fr/fr/location'],
});
