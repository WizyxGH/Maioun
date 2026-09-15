/**
 * Source : Sud Contact Immobilier (nice-ouest-immobilier.com) — 46 avenue
 * Saint-Augustin, 06200 Nice. Plateforme La Boîte Immo : adaptateur générique
 * `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 2 fiches à Nice (un studio, une chambre en colocation).
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const sudContactScraper = makeHektorScraper({
  id: 'sud-contact',
  name: 'Sud Contact Immobilier',
  domain: 'nice-ouest-immobilier.com',
  agencyContact: {
    address: { street: '46 avenue Saint-Augustin', postalCode: '06200', city: 'Nice' },
  },
  logo: 'https://www.nice-ouest-immobilier.com/images/favicon.png',
  listUrls: ['https://www.nice-ouest-immobilier.com/location/1'],
});
