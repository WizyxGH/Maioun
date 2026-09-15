/**
 * Source : Azur Conseil Salmon (acsimmo.fr) — 26 boulevard de Cessole, 06100
 * Nice. Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * « 0 annonces de logements à louer » ce jour-là ; gardée pour les biens à
 * venir.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const azurConseilSalmonScraper = makeHektorScraper({
  id: 'azur-conseil-salmon',
  name: 'Azur Conseil Salmon',
  domain: 'acsimmo.fr',
  logo: 'https://www.acsimmo.fr/images/favicon.png',
  agencyContact: {
    phone: '04 93 97 45 45', // secret-scan-ignore
    email: 'info@acsimmo.fr', // secret-scan-ignore
    address: { street: '26 boulevard de Cessole', postalCode: '06100', city: 'Nice' },
  },
  listUrls: ['https://www.acsimmo.fr/location/1'],
});
