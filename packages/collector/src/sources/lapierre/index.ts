/**
 * Source : Anne-Sophie Lapierre Immobilier (lapierre-immobilier.com) —
 * Cagnes-sur-Mer. Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme. 2 locations
 * (une villa à Nice, un trois-pièces à Cagnes-sur-Mer).
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const lapierreScraper = makeHektorScraper({
  id: 'lapierre',
  name: 'Anne-Sophie Lapierre Immobilier',
  domain: 'lapierre-immobilier.com',
  listUrls: ['https://www.lapierre-immobilier.com/location/1'],
});
