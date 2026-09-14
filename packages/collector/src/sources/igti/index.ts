/**
 * Source : Immobilière GTI (immobilieregti.com) — 35 rue Pastorelli, Nice ;
 * franchise Orpi à sept agences. `immonice.com` y redirige. Plateforme La Boîte
 * Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme. 16 fiches sur
 * deux pages, dont 14 à Nice (4 stationnements). Ses annonces peuvent aussi
 * figurer sur orpi.com : le dédoublonnage les rapproche.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const igtiScraper = makeHektorScraper({
  id: 'igti',
  name: 'Immobilière GTI',
  domain: 'immobilieregti.com',
  listUrls: [
    'https://www.immobilieregti.com/a-louer/1',
    'https://www.immobilieregti.com/a-louer/2',
  ],
});
