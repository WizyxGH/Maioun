/**
 * Source : Sun Immobilia (sunimmobilia.fr) — 56 promenade de la Plage, 06800
 * Cagnes-sur-Mer. Plateforme Netty : adaptateur générique `../netty/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /*.pdf, Crawl-delay 5
 * respecté. Une seule location au sitemap, un local commercial écarté par le
 * parseur ; gardée pour les logements à venir.
 */

import { makeNettyScraper } from '../netty/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const sunImmobiliaScraper = makeNettyScraper({
  id: 'sun-immobilia',
  name: 'Sun Immobilia',
  domain: 'sunimmobilia.fr',
  sitemapUrl: 'https://www.sunimmobilia.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
