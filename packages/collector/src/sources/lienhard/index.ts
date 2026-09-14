/**
 * Source : Lienhard Immo (lienhardimmo.fr) — agence de La Wantzenau (67) qui
 * publie aussi à Nice. Plateforme Netty : adaptateur générique `../netty/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n'interdit que /*.pdf, Crawl-delay 5
 * respecté. 1 location à Nice ; le filtre de communes écarte le reste du
 * sitemap sans visite.
 */

import { makeNettyScraper } from '../netty/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const lienhardScraper = makeNettyScraper({
  id: 'lienhard',
  name: 'Lienhard Immo',
  domain: 'lienhardimmo.fr',
  sitemapUrl: 'https://www.lienhardimmo.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
