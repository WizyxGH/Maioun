/**
 * Source : L&B Immobilier (lb-immobilier.fr) — 4 avenue de Verdun, 06000 Nice.
 * Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 2 locations à Nice.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const lbImmobilierScraper = makeHektorScraper({
  id: 'lb-immobilier',
  name: 'L&B Immobilier',
  domain: 'lb-immobilier.fr',
  logo: 'https://www.lb-immobilier.fr/images/favicon.png',
  listUrls: ['https://www.lb-immobilier.fr/location/1'],
});
