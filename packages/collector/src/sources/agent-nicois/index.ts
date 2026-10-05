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
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Zenia/1366/media/fed75df98697547552b96f98b624cfe8.png',
  listUrls: ['https://agentnicois.com/fr/locations'],
});
