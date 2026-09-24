/**
 * Source : Valrose Immobilier (valrose-immo.fr), SARL CSGM — 108 avenue
 * Saint-Lambert, 06100 Nice (vitrine « Immobilière Prestige »). Plateforme
 * Apimo : adaptateur `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php, sitemap
 * déclaré. 30 fiches de location de moins d'un an dans les communes cibles
 * (Nice surtout), dont une vingtaine lue en sonde avec adresse et photos.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const valroseImmobilierScraper = makeApimoScraper({
  id: 'valrose-immobilier',
  name: 'Valrose Immobilier',
  domain: 'valrose-immo.fr',
  sitemapUrl: 'https://valrose-immo.fr/sitemap.xml',
  listUrls: ['https://valrose-immo.fr/fr/locations'],
  citySlugs: NICE_AREA_SLUGS,
  agencyContact: {
    phone: '04 92 07 08 64', // secret-scan-ignore
    email: 'immobilier-prestige@wanadoo.fr', // secret-scan-ignore
    address: { street: '108 avenue Saint-Lambert', postalCode: '06100', city: 'Nice' },
  },
});
