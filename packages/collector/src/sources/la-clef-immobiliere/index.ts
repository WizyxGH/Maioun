/**
 * Source : La Clef Immobilière (laclefimmobiliere.com) — 24 boulevard
 * Saint-Roch, 06300 Nice. Plateforme La Boîte Immo : adaptateur générique
 * `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * « Aucun bien n'est disponible pour le moment » en location ; gardée pour
 * les biens à venir.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const laClefImmobiliereScraper = makeHektorScraper({
  id: 'la-clef-immobiliere',
  name: 'La Clef Immobilière',
  domain: 'laclefimmobiliere.com',
  logo: 'https://www.laclefimmobiliere.com/images/favicon.png',
  agencyContact: {
    phone: '04 89 22 89 33', // secret-scan-ignore
    email: 'agence@laclefimmobiliere.com', // secret-scan-ignore
    address: { street: '24 boulevard Saint-Roch', postalCode: '06300', city: 'Nice' },
  },
  listUrls: ['https://www.laclefimmobiliere.com/location/1'],
});
