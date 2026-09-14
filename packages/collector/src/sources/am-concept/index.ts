/**
 * Source : AM Concept Patrimoine Immobilier (amconcept.immo) — La Trinité.
 * Plateforme Netty : adaptateur générique `../netty/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n'interdit que /*.pdf, Crawl-delay 5
 * respecté. 2 locations ciblées (un studio à Nice, un bureau à La Trinité).
 */

import { makeNettyScraper } from '../netty/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const amConceptScraper = makeNettyScraper({
  id: 'am-concept',
  name: 'AM Concept Patrimoine Immobilier',
  domain: 'amconcept.immo',
  sitemapUrl: 'https://www.amconcept.immo/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
