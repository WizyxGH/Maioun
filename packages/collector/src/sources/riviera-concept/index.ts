/**
 * Source : Riviera Concept (rivieraconcept.com) — 67 rue Rossini, 06000 Nice.
 * Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 2 locations à Nice.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const rivieraConceptScraper = makeHektorScraper({
  id: 'riviera-concept',
  name: 'Riviera Concept',
  domain: 'rivieraconcept.com',
  agencyContact: { address: { street: '67 rue Rossini', postalCode: '06000', city: 'Nice' } },
  logo: 'https://www.rivieraconcept.com/images/favicon.png',
  listUrls: ['https://www.rivieraconcept.com/location/1'],
});
