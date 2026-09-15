/**
 * Source : Cabinet Marro Immobilier (marro-immobilier.com) — 41 boulevard
 * Pierre Sola, 06300 Nice. Plateforme La Boîte Immo : adaptateur `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin interdits). 3 locations à Nice.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const marroImmobilierScraper = makeHektorScraper({
  id: 'marro-immobilier',
  name: 'Cabinet Marro Immobilier',
  domain: 'marro-immobilier.com',
  logo: 'https://www.marro-immobilier.com/images/favicon.png',
  agencyContact: {
    phone: '04 93 55 51 39', // secret-scan-ignore
    email: 'marro.immobilier@gmail.com', // secret-scan-ignore
    address: { street: '41 boulevard Pierre Sola', postalCode: '06300', city: 'Nice' },
  },
  listUrls: ['https://www.marro-immobilier.com/a-louer/1'],
});
