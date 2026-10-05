/**
 * Source : Foch Immobilier (groupe-foch.com) — agence niçoise (quartier du
 * port), gestion locative depuis 1989, sur la plateforme Apimo/Cello (§47).
 *
 * Identifiée par l'inventaire Apimo du 2026-08-17. robots.txt revérifié le
 * 2026-08-17 : signature Apimo exacte. ~25 locations (Nice, Cagnes-sur-Mer)
 * dans le sitemap au moment de l'étude.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const groupeFochScraper = makeApimoScraper({
  id: 'groupe-foch',
  name: 'Foch Immobilier',
  domain: 'groupe-foch.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Elone/3077/media/1e51e8d919dd2e739bdf23b53be3afb2.png',
  sitemapUrl: 'https://groupe-foch.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://groupe-foch.com/fr/louer'],
});
