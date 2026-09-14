/**
 * Source : Cabinet Nardi (cabinetnardi.com) — 11 rue Gubernatis, 06000 Nice.
 * Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 1 location à Nice.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const cabinetNardiScraper = makeHektorScraper({
  id: 'cabinet-nardi',
  name: 'Cabinet Nardi',
  domain: 'cabinetnardi.com',
  logo: 'https://www.cabinetnardi.com/images/favicon.png',
  listUrls: ['https://www.cabinetnardi.com/location/1'],
});
