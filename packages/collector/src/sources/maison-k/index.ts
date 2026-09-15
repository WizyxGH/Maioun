/**
 * Source : Maison K Immobilier (maisonk-immobilier.com) — 3 place Masséna,
 * 06000 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php, sitemap
 * déclaré. /fr/locations affiche « aucun produit », mais le sitemap garde deux
 * fiches de location au Mont Boron (meublé haut de gamme), lues sans erreur.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const maisonKScraper = makeApimoScraper({
  id: 'maison-k',
  name: 'Maison K Immobilier',
  domain: 'maisonk-immobilier.com',
  sitemapUrl: 'https://maisonk-immobilier.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  agencyContact: {
    phone: '06 62 41 83 00', // secret-scan-ignore
    email: 'agence@maisonk-immobilier.com', // secret-scan-ignore
    address: { street: '3 place Masséna', postalCode: '06000', city: 'Nice' },
  },
});
