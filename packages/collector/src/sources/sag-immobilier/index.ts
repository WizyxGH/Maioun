/**
 * Source : SAG Immobilier (sag-immobilier.com) — Nice. Plateforme La Boîte
 * Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 11 locations, toutes à Nice.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const sagImmobilierScraper = makeHektorScraper({
  id: 'sag-immobilier',
  name: 'SAG Immobilier',
  domain: 'sag-immobilier.com',
  listUrls: ['https://www.sag-immobilier.com/location/1'],
});
