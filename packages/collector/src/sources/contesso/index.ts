/**
 * Source : Orpi Agence Contesso (agence-contesso.com) — 5 avenue des Cigales,
 * 06510 Carros. Son site propre est sur La Boîte Immo : adaptateur générique
 * `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme. 4 fiches, dont
 * 3 dans la zone (Nice, Carros ×2 dont un parking).
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const contessoScraper = makeHektorScraper({
  id: 'contesso',
  name: 'Orpi Agence Contesso',
  domain: 'agence-contesso.com',
  logo: 'https://www.agence-contesso.com/images/favicon.png',
  listUrls: ['https://www.agence-contesso.com/location/1'],
});
