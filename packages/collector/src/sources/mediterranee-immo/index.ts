/**
 * Source : Méditerranée Immo (mediterranee-immo.fr) — 20 avenue Valombrose,
 * Nice. Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme. 4 locations à
 * Nice, studios et deux-pièces pour étudiants.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const mediterraneeImmoScraper = makeHektorScraper({
  id: 'mediterranee-immo',
  name: 'Méditerranée Immo',
  domain: 'mediterranee-immo.fr',
  listUrls: ['https://www.mediterranee-immo.fr/location/1'],
});
