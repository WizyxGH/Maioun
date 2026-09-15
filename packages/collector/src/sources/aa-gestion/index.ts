/**
 * Source : AA Gestion (aagestion.net) — 3 boulevard du Parc Impérial, 06000
 * Nice. Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 6 locations (Nice ×5, Grasse). Liste vide à l’étude du 2026-08-17, garnie
 * depuis.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const aaGestionScraper = makeHektorScraper({
  id: 'aa-gestion',
  name: 'AA Gestion',
  domain: 'aagestion.net',
  agencyContact: {
    address: { street: '3 boulevard du Parc Impérial', postalCode: '06000', city: 'Nice' },
  },
  logo: 'https://www.aagestion.net/images/favicon.png',
  listUrls: ['https://www.aagestion.net/location/1'],
});
