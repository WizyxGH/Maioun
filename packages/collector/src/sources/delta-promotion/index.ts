/**
 * Source : Delta Promotion (delta-promotion.com) — 29 rue Pastorelli, 06000
 * Nice. Agence immobilière malgré son nom. Plateforme La Boîte Immo :
 * adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * « 0 annonces de logements à louer » ce jour-là ; gardée pour les biens à
 * venir.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const deltaPromotionScraper = makeHektorScraper({
  id: 'delta-promotion',
  name: 'Delta Promotion',
  domain: 'delta-promotion.com',
  logo: 'https://www.delta-promotion.com/images/favicon.png',
  agencyContact: {
    phone: '04 92 47 77 47', // secret-scan-ignore
    email: 'deltapromotion@wanadoo.fr', // secret-scan-ignore
    address: { street: '29 rue Pastorelli', postalCode: '06000', city: 'Nice' },
  },
  listUrls: ['https://www.delta-promotion.com/location/1'],
});
