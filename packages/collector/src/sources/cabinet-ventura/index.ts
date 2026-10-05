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
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const cabinetVenturaScraper = makeApimoScraper({
  id: 'cabinet-ventura',
  name: 'Cabinet Ventura',
  domain: 'cabinetventura.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Elone/2128/media/91c913b968b94bbbdc94dc92d7d15c0d.png',
  agencyContact: {
    address: { street: '61 boulevard Victor Hugo', postalCode: '06000', city: 'Nice' },
  },
  sitemapUrl: 'https://cabinetventura.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://cabinetventura.com/fr/locations'],
});
