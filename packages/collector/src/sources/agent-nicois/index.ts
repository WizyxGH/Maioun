/**
 * Source : L'Agent Niçois (agentnicois.com) — Nice. Apimo ancien schéma :
 * `../apimo/list-scraper.ts`.
 *
 * Vérifié le 2026-09-14 : robots.txt n'interdit que /app_dev.php. 1 location à
 * Nice (Carré d'Or).
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const agentNicoisScraper = makeApimoListScraper({
  id: 'agent-nicois',
  name: "L'Agent Niçois",
  domain: 'agentnicois.com',
  listUrls: ['https://agentnicois.com/fr/locations'],
});
