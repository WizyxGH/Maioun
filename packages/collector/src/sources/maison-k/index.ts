/**
 * Source : Maison K Immobilier (maisonk-immobilier.com) — 3 place Masséna,
 * 06000 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php, sitemap
 * déclaré. /fr/locations affiche « aucun produit », mais le sitemap garde deux
 * fiches de location au Mont Boron (meublé haut de gamme), lues sans erreur.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const maisonKScraper = makeApimoScraper({
  id: 'maison-k',
  name: 'Maison K Immobilier',
  domain: 'maisonk-immobilier.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Elone/3806/media/a6bdeae23eef4210b0b5054fce2d7721.png',
  sitemapUrl: 'https://maisonk-immobilier.com/sitemap.xml',
  listUrls: ['https://maisonk-immobilier.com/fr/locations'],
  citySlugs: NICE_AREA_SLUGS,
  agencyContact: {
    phone: '06 62 41 83 00', // secret-scan-ignore
    email: 'agence@maisonk-immobilier.com', // secret-scan-ignore
    address: { street: '3 place Masséna', postalCode: '06000', city: 'Nice' },
  },
});
