/**
 * Source : Alberti Immobilier (agencealbertinice.com) — agence niçoise sur la
 * plateforme Apimo/Cello (§47). Repérée le 2026-08-24 via les e-mails de
 * confirmation SeLoger (agence contactée non encore couverte).
 *
 * Signature Apimo confirmée le 2026-08-24 : footer « Design by Apimo™ », sitemap
 * index → /fr/propriete/location*. ~19 locations Nice au sitemap. robots.txt
 * permissif (signature Apimo : seul /app_dev.php interdit).
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const albertiScraper = makeApimoScraper({
  id: 'alberti',
  name: 'Alberti Immobilier',
  domain: 'agencealbertinice.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Elone-v2/3986/media/5d2b1b7eb9ec0af2bf05663c8ccb3257.png',
  sitemapUrl: 'https://agencealbertinice.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://www.agencealbertinice.com/fr/locations'],
});
