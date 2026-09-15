/**
 * Source : Cabinet Ledeux (cabinetledeux.com) — 15 rue Cassini, 06300 Nice.
 * Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits). 2
 * locations à Nice (T3 meublés), descriptions complètes.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const cabinetLedeuxScraper = makeHektorScraper({
  id: 'cabinet-ledeux',
  name: 'Cabinet Ledeux Immobilier',
  domain: 'cabinetledeux.com',
  logo: 'https://www.cabinetledeux.com/images/favicon.png',
  agencyContact: {
    phone: '04 93 82 32 28', // secret-scan-ignore
    email: 'cabinet.ledeux.nice@orange.fr', // secret-scan-ignore
    address: { street: '15 rue Cassini', postalCode: '06300', city: 'Nice' },
  },
  listUrls: ['https://www.cabinetledeux.com/location/1'],
});
