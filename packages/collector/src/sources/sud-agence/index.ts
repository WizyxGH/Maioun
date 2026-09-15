/**
 * Source : Sud Agence (sudagence.fr) — 25 rue Arson, 06300 Nice. Plateforme
 * La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits). 9
 * locations, toutes à Nice (6 logements, 3 stationnements), sur une seule
 * page. L'agence a aussi des secteurs Perpignan et Toulouse, hors zone.
 * Demandée par l'utilisateur.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const sudAgenceScraper = makeHektorScraper({
  id: 'sud-agence',
  name: 'Sud Agence',
  domain: 'sudagence.fr',
  logo: 'https://www.sudagence.fr/images/favicon.png',
  agencyContact: {
    phone: '04 93 89 42 08', // secret-scan-ignore
    email: 'sudagence.immo@orange.fr', // secret-scan-ignore
    address: { street: '25 rue Arson', postalCode: '06300', city: 'Nice' },
  },
  listUrls: ['https://www.sudagence.fr/location/1'],
});
