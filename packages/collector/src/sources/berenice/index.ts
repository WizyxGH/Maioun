/**
 * Source : Bérénice Immobilier (berenice-immobilier.com) — 4 boulevard
 * Gambetta, 06000 Nice. Plateforme La Boîte Immo, ancien gabarit : adaptateur
 * générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme. 4 fiches, dont
 * 3 à Nice. Ni l'URL ni la fiche ne nomment la commune : elle vient du code
 * postal (06000 à 06300 = Nice).
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const bereniceScraper = makeHektorScraper({
  id: 'berenice',
  name: 'Bérénice Immobilier',
  domain: 'berenice-immobilier.com',
  agencyContact: { address: { street: '4 boulevard Gambetta', postalCode: '06000', city: 'Nice' } },
  logo: 'https://www.berenice-immobilier.com/images/favicon.png',
  listUrls: ['https://www.berenice-immobilier.com/a-louer/1'],
});
