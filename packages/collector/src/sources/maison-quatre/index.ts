/**
 * Source : Maison Quatre (maisonquatre.la-boite-immo.com) — 4 rue Dalpozzo,
 * 06000 Nice. Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 2 locations à Nice. Pas d’autre domaine que le sous-domaine La Boîte Immo.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const maisonQuatreScraper = makeHektorScraper({
  id: 'maison-quatre',
  name: 'Maison Quatre',
  domain: 'maisonquatre.la-boite-immo.com',
  logo: 'https://maisonquatre.la-boite-immo.com/images/favicon.png',
  listUrls: ['https://maisonquatre.la-boite-immo.com/location/1'],
});
