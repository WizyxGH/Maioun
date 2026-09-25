/**
 * Source : Optimmo Nice (groupe-optimmo.fr) — Nice (06100). Plateforme Netty :
 * adaptateur générique `../netty/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n'interdit que /*.pdf, Crawl-delay 5
 * respecté. 10 locations ciblées au sitemap (Nice ×8 dont 2 parkings et 2
 * locaux, Cagnes, Villeneuve-Loubet).
 */

import { makeNettyScraper } from '../netty/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const optimmoScraper = makeNettyScraper({
  id: 'optimmo',
  name: 'Optimmo',
  domain: 'groupe-optimmo.fr',
  sitemapUrl: 'https://www.groupe-optimmo.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
