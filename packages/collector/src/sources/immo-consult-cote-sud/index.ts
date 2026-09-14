/**
 * Source : Immo Consult Côté Sud (immoconsultcotesud.com) — 72 avenue
 * d’Estienne d’Orves, 06000 Nice. Plateforme La Boîte Immo : adaptateur
 * générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 1 location à Nice.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const immoConsultCoteSudScraper = makeHektorScraper({
  id: 'immo-consult-cote-sud',
  name: 'Immo Consult Côté Sud',
  domain: 'immoconsultcotesud.com',
  logo: 'https://www.immoconsultcotesud.com/images/favicon.png',
  listUrls: ['https://www.immoconsultcotesud.com/location/1'],
});
