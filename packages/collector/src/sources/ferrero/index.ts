/**
 * Source : Agence Ferrero (ferrero-immobilier.fr) — avenue de la Résistance,
 * Vence. Plateforme Netty : adaptateur générique `../netty/`. Ses adresses de
 * fiche omettent le code postal (`location-appartement-nice,LA1968`).
 *
 * Vérifié le 2026-09-14 : robots.txt n'interdit que /*.pdf, Crawl-delay 5
 * respecté. 5 locations au sitemap, dont une à Nice ; Vence et Tourrettes sont
 * écartées sans visite par le filtre de communes.
 */

import { makeNettyScraper } from '../netty/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const ferreroScraper = makeNettyScraper({
  id: 'ferrero',
  name: 'Agence Ferrero',
  domain: 'ferrero-immobilier.fr',
  sitemapUrl: 'https://www.ferrero-immobilier.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
