/**
 * Source : Agence des Domaines (agencedesdomaines.com) — 57 avenue de la Gare,
 * 06800 Cagnes-sur-Mer. Plateforme La Boîte Immo : adaptateur générique
 * `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 1 fiche au relevé, un garage : gardée pour les logements à venir.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const agenceDesDomainesScraper = makeHektorScraper({
  id: 'agence-des-domaines',
  name: 'Agence des Domaines',
  domain: 'agencedesdomaines.com',
  logo: 'https://www.agencedesdomaines.com/images/favicon.png',
  listUrls: ['https://www.agencedesdomaines.com/a-louer/1'],
});
