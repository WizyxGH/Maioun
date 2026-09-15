/**
 * Source : Belgravia (belgravia.fr) — 54 rue Gioffredo, 06000 Nice. Plateforme
 * La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 2 locations (Nice, Villefranche-sur-Mer).
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const belgraviaScraper = makeHektorScraper({
  id: 'belgravia',
  name: 'Belgravia',
  domain: 'belgravia.fr',
  agencyContact: { address: { street: '54 rue Gioffredo', postalCode: '06000', city: 'Nice' } },
  logo: 'https://www.belgravia.fr/images/favicon.png',
  listUrls: ['https://www.belgravia.fr/location/1'],
});
