/**
 * Source : Englimmo (englimmo.com) — 165 avenue de la Californie, 06200 Nice.
 * Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits). 3
 * locations à Nice, toutes étudiantes ou en colocation (baux 9 à 10 mois).
 * Demandée par l'utilisateur.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const englimmoScraper = makeHektorScraper({
  id: 'englimmo',
  name: 'Englimmo',
  domain: 'englimmo.com',
  logo: 'https://www.englimmo.com/images/favicon.png',
  agencyContact: {
    phone: '06 66 40 27 78', // secret-scan-ignore
    email: 'info.englimmo@gmail.com', // secret-scan-ignore
    address: { street: '165 avenue de la Californie', postalCode: '06200', city: 'Nice' },
  },
  listUrls: ['https://www.englimmo.com/location/1'],
});
