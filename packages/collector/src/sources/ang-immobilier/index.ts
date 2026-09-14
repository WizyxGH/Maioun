/**
 * Source : ANG Immobilier – Agence Nice Gambetta (agence-nice-gambetta.fr) —
 * boulevard Gambetta, Nice. Plateforme La Boîte Immo : adaptateur générique
 * `../hektor/`. Le sous-domaine `agence-nice-gambetta.la-boite-immo.com` sert
 * les mêmes annonces : seul le domaine propre est lu.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme. 5 locations à
 * Nice (dont un garage et un parking). L'agence réécrit son <title>, qui peut
 * nommer une autre surface que celle du bien (« terrasse de 8 m² »).
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const angImmobilierScraper = makeHektorScraper({
  id: 'ang-immobilier',
  name: 'ANG Immobilier',
  domain: 'agence-nice-gambetta.fr',
  listUrls: ['https://www.agence-nice-gambetta.fr/location/1'],
});
