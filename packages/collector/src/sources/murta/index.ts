/**
 * Source : Murta Immobilier (murta-immobilier.com) — 23 bis avenue Général de
 * Gaulle, 06340 Drap. Plateforme La Boîte Immo : adaptateur générique
 * `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 6 locations dont Nice ×2, Drap, Contes ; les villages de l’arrière-pays sont
 * écartés au scoring.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const murtaScraper = makeHektorScraper({
  id: 'murta',
  name: 'Murta Immobilier',
  domain: 'murta-immobilier.com',
  agencyContact: {
    address: { street: '23 bis avenue Général de Gaulle', postalCode: '06340', city: 'Drap' },
  },
  logo: 'https://www.murta-immobilier.com/images/favicon.png',
  listUrls: ['https://www.murta-immobilier.com/location/1'],
});
