/**
 * Source : Groupe Cabinet Picado (groupepicado.com) — 12 avenue Malausséna,
 * 06000 Nice. Apimo ancien schéma : `../apimo/list-scraper.ts`.
 *
 * Vérifié le 2026-09-14 : robots.txt n'interdit que /app_dev.php. 9 fiches sur
 * une page, Nice ×8 (5 appartements, 3 locaux) et Peillon.
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const groupePicadoScraper = makeApimoListScraper({
  id: 'groupe-picado',
  name: 'Groupe Picado',
  domain: 'groupepicado.com',
  listUrls: ['https://groupepicado.com/fr/locations'],
});
