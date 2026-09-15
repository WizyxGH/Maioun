/**
 * Source : Phoenix GLV (phoenix-glv.com) — 455 promenade des Anglais, 06200
 * Nice. Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * Liste des locations vide ce jour-là ; gardée pour les biens à venir
 * (transaction, location et gestion).
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const phoenixGlvScraper = makeHektorScraper({
  id: 'phoenix-glv',
  name: 'Phoenix GLV',
  domain: 'phoenix-glv.com',
  logo: 'https://www.phoenix-glv.com/images/favicon.png',
  agencyContact: {
    phone: '07 55 65 71 10', // secret-scan-ignore
    address: { street: '455 promenade des Anglais', postalCode: '06200', city: 'Nice' },
  },
  listUrls: ['https://www.phoenix-glv.com/location/1'],
});
