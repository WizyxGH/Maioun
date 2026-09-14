/**
 * Source : Coprogestimmo (coprogestimmo.fr) — Nice et Menton. Plateforme La
 * Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 4 locations (Nice ×2, Menton ×2).
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const coprogestimmoScraper = makeHektorScraper({
  id: 'coprogestimmo',
  name: 'Coprogestimmo',
  domain: 'coprogestimmo.fr',
  logo: 'https://www.coprogestimmo.fr/images/favicon.png',
  listUrls: ['https://www.coprogestimmo.fr/location/1'],
});
