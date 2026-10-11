/**
 * Source : Beliyz Immobilier (beliyz.com) — agence indépendante niçoise (14 Rue
 * Cassini, 06300 Nice) fondée en 2024, sur plateforme Apimo/Cello (§47).
 *
 * Signature Apimo confirmée le 2026-10-09 : Elone-v2 sur CloudFront, photos
 * hébergées sur media.apimo.pro, sitemap index -> sitemap-1.xml
 * (/fr/propriete/location*), robots.txt permissif (seul /app_dev.php interdit).
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const beliyzScraper = makeApimoScraper({
  id: 'beliyz',
  name: 'Beliyz Immobilier',
  domain: 'beliyz.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Elone-v2/4824/media/5fc5ec3852c6053b5f09d9500a542c64.png',
  agencyContact: {
    address: { street: '14 Rue Cassini', postalCode: '06300', city: 'Nice' },
    phone: '+33 9 86 24 64 77', // secret-scan-ignore
    email: 'contact@beliyz.com', // secret-scan-ignore
  },
  sitemapUrl: 'https://beliyz.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://beliyz.com/fr/location'],
});
