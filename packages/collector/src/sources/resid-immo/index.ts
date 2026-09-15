/**
 * Source : Resid'Immo (residimmo.fr) — 900 boulevard du Mercantour, 06200 Nice
 * (La Manda), et Saint-Martin-du-Var. Plateforme La Boîte Immo : adaptateur
 * générique `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits). 2
 * locations, toutes deux à Colomars, commune limitrophe de Nice ouest.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const residImmoScraper = makeHektorScraper({
  id: 'resid-immo',
  name: 'Resid’Immo',
  domain: 'residimmo.fr',
  logo: 'https://www.residimmo.fr/images/favicon.png',
  agencyContact: {
    phone: '04 93 29 15 47', // secret-scan-ignore
    email: 'transaction@agence-residimmo.fr', // secret-scan-ignore
    address: { street: '900 boulevard du Mercantour', postalCode: '06200', city: 'Nice' },
  },
  listUrls: ['https://www.residimmo.fr/location/1'],
});
