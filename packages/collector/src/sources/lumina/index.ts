/**
 * Source : Lumina Immobilier (lumina-immo.fr) — 27 rue Alphonse Karr, Nice.
 * Plateforme Netty : adaptateur générique `../netty/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n'interdit que /*.pdf, Crawl-delay 5
 * respecté. 1 location à Nice (une colocation étudiante).
 */

import { makeNettyScraper } from '../netty/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const luminaScraper = makeNettyScraper({
  id: 'lumina',
  name: 'Lumina Immobilier',
  domain: 'lumina-immo.fr',
  sitemapUrl: 'https://www.lumina-immo.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
