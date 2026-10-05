/**
 * Source : Cabinet Central Gestion (immobilier-cabinetcentral.fr, vitrine de
 * cabinetcentral.fr) — Palais Nadaud, 24 avenue Georges Clemenceau, 06000
 * Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php ; fiches
 * `/fr/propriete/location+…`.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const cabinetCentralGestionScraper = makeApimoScraper({
  id: 'cabinet-central-gestion',
  name: 'Cabinet Central Gestion',
  domain: 'immobilier-cabinetcentral.fr',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Zenia-v2/3317/media/13c55735ef6710138eb8927df198789a.jpeg',
  sitemapUrl: 'https://immobilier-cabinetcentral.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://immobilier-cabinetcentral.fr/fr/locations'],
  agencyContact: {
    phone: '04 93 04 08 70', // secret-scan-ignore
    address: { street: '24 avenue Georges Clemenceau', postalCode: '06000', city: 'Nice' },
  },
});
