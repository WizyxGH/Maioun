/**
 * Source : Midem Immobilier (midem-immobilier.fr) — 8 avenue Saint-Augustin,
 * 06200 Nice. Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 4 locations (Nice ×3, Villeneuve-Loubet).
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const midemScraper = makeHektorScraper({
  id: 'midem',
  name: 'Midem Immobilier',
  domain: 'midem-immobilier.fr',
  agencyContact: {
    address: { street: '8 avenue Saint-Augustin', postalCode: '06200', city: 'Nice' },
  },
  logo: 'https://www.midem-immobilier.fr/images/favicon.png',
  listUrls: ['https://www.midem-immobilier.fr/location/1'],
});
