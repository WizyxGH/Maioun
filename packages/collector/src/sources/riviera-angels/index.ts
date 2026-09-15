/**
 * Source : Riviera Angels Immobilier (riviera-angels.com) — 50 rue de France,
 * 06000 Nice. Plateforme La Boîte Immo, liste sans liens de fiche : adaptateur
 * `../hektor/`, qui reconstruit leur adresse.
 *
 * robots.txt vérifié le 2026-09-15 : standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits). 2
 * locations à Nice au relevé.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const rivieraAngelsScraper = makeHektorScraper({
  id: 'riviera-angels',
  name: 'Riviera Angels Immobilier',
  domain: 'riviera-angels.com',
  agencyContact: {
    phone: '04 93 16 00 63', // secret-scan-ignore
    email: 'info@riviera-angels.com', // secret-scan-ignore
    address: { street: '50 rue de France', postalCode: '06000', city: 'Nice' },
  },
  listUrls: ['https://www.riviera-angels.com/a-louer/1'],
});
