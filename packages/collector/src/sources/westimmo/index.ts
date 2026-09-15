/**
 * Source : Westimmo (westimmo-properties.com) — 200 avenue de la Californie,
 * 06200 Nice. Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * « Aucune annonce trouvée » en location ce jour-là ; gardée pour les biens à
 * venir (l'agence fait de la gestion locative).
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const westimmoScraper = makeHektorScraper({
  id: 'westimmo',
  name: 'Westimmo',
  domain: 'westimmo-properties.com',
  logo: 'https://www.westimmo-properties.com/images/favicon.png',
  agencyContact: {
    phone: '04 93 41 44 70', // secret-scan-ignore
    email: 'westimmo.promenade@gmail.com', // secret-scan-ignore
    address: { street: '200 avenue de la Californie', postalCode: '06200', city: 'Nice' },
  },
  listUrls: ['https://www.westimmo-properties.com/location/1'],
});
