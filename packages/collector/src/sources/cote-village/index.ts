/**
 * Source : Immobilier Côté Village (immobilier-cote-village.com) — 112
 * boulevard Général de Gaulle, 06340 La Trinité. Plateforme La Boîte Immo :
 * adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 4 locations (La Trinité ×3, Nice) : l’une des rares sources de La Trinité.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const coteVillageScraper = makeHektorScraper({
  id: 'cote-village',
  name: 'Immobilier Côté Village',
  domain: 'immobilier-cote-village.com',
  agencyContact: {
    address: { street: '112 boulevard Général de Gaulle', postalCode: '06340', city: 'La Trinité' },
  },
  logo: 'https://www.immobilier-cote-village.com/images/favicon.png',
  listUrls: ['https://www.immobilier-cote-village.com/location/1'],
});
