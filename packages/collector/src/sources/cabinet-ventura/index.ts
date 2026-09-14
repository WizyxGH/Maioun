/**
 * Source : Cabinet Ventura (cabinetventura.com) — 61 boulevard Victor Hugo,
 * 06000 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 22 locations à Nice au sitemap (14 appartements, le reste en parkings et
 * locaux).
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const cabinetVenturaScraper = makeApimoScraper({
  id: 'cabinet-ventura',
  name: 'Cabinet Ventura',
  domain: 'cabinetventura.com',
  sitemapUrl: 'https://cabinetventura.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
