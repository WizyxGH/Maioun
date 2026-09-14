/**
 * Source : Immobilière Pelou (immobiliere-pelou.com) — Marina Baie des Anges,
 * Villeneuve-Loubet. Plateforme La Boîte Immo : adaptateur générique
 * `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 1 location à l’année. La location saisonnière a sa propre page, jamais lue.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const immobilierePelouScraper = makeHektorScraper({
  id: 'immobiliere-pelou',
  name: 'Immobilière Pelou',
  domain: 'immobiliere-pelou.com',
  logo: 'https://www.immobiliere-pelou.com/images/favicon.png',
  listUrls: ['https://www.immobiliere-pelou.com/a-louer/1'],
});
