/**
 * Source : Cabinet Central Gestion (immobilier-cabinetcentral.fr, vitrine de
 * cabinetcentral.fr) — Palais Nadaud, 24 avenue Georges Clemenceau, 06000
 * Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php ; fiches
 * `/fr/propriete/location+…`.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const cabinetCentralGestionScraper = makeApimoScraper({
  id: 'cabinet-central-gestion',
  name: 'Cabinet Central Gestion',
  domain: 'immobilier-cabinetcentral.fr',
  sitemapUrl: 'https://immobilier-cabinetcentral.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://immobilier-cabinetcentral.fr/fr/locations'],
  agencyContact: {
    phone: '04 93 04 08 70', // secret-scan-ignore
    address: { street: '24 avenue Georges Clemenceau', postalCode: '06000', city: 'Nice' },
  },
});
