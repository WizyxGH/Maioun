/**
 * Source : Keller Williams France (kwfrance.com) — réseau de conseillers
 * indépendants, dont plusieurs à Nice. Plateforme Netty : adaptateur générique
 * `../netty/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /*.pdf, Crawl-delay 5
 * respecté. Un seul sitemap national (~2 300 ventes, ~90 locations) : les
 * fiches de location des communes cibles se filtrent sur l'URL. Aucune
 * location dans la zone aujourd'hui (Le Cannet, Cannes, Antibes seulement),
 * suivie parce que le réseau vend beaucoup à Nice et peut y louer.
 */

import { makeNettyScraper } from '../netty/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const kellerWilliamsScraper = makeNettyScraper({
  id: 'keller-williams',
  name: 'Keller Williams',
  domain: 'kwfrance.com',
  sitemapUrl: 'https://www.kwfrance.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
