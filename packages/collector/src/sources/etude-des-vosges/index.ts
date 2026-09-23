/**
 * Source : Étude des Vosges (etudedesvosges.fr) — 3 avenue de Saint-Sylvestre,
 * 06100 Nice. Plateforme Apimo/Cello : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php, sitemap
 * déclaré. 3 locations, dont une à Nice ; les deux d'Antibes sont hors des
 * communes cibles.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const etudeDesVosgesScraper = makeApimoScraper({
  id: 'etude-des-vosges',
  name: 'Étude des Vosges',
  domain: 'etudedesvosges.fr',
  sitemapUrl: 'https://www.etudedesvosges.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://www.etudedesvosges.fr/fr/locations'],
  agencyContact: {
    phone: '04 93 84 30 10', // secret-scan-ignore
    address: { street: '3 avenue de Saint-Sylvestre', postalCode: '06100', city: 'Nice' },
  },
});
