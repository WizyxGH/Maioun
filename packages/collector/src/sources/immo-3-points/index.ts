/**
 * Source : Immo 3 Points (immo3points.fr) — 1 rue Alberti, 06000 Nice.
 * Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const immo3PointsScraper = makeHektorScraper({
  id: 'immo-3-points',
  name: 'Immo 3 Points',
  domain: 'immo3points.fr',
  agencyContact: {
    phone: '09 88 43 74 61', // secret-scan-ignore
    email: 'i3p@immo3points.com', // secret-scan-ignore
    address: { street: '1 rue Alberti', postalCode: '06000', city: 'Nice' },
  },
  listUrls: ['https://www.immo3points.fr/location/1'],
});
