/**
 * Source : API Nice — Azur Patrimoine Immobilier (agence-api.com), agence du
 * port au 3 rue Bavastro, 06300 Nice (aussi Menton et Callian). Plateforme La
 * Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * Aucune location ce jour-là ; gardée pour les biens à venir. Les biens de
 * Menton ou Callian seront écartés au scoring.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const apiNiceScraper = makeHektorScraper({
  id: 'api-nice',
  name: 'API Nice (Azur Patrimoine Immobilier)',
  domain: 'agence-api.com',
  logo: 'https://www.agence-api.com/images/favicon.png',
  agencyContact: {
    phone: '07 85 91 31 66', // secret-scan-ignore
    email: 'api06950@gmail.com', // secret-scan-ignore
    address: { street: '3 rue Bavastro', postalCode: '06300', city: 'Nice' },
  },
  listUrls: ['https://www.agence-api.com/location/1'],
});
