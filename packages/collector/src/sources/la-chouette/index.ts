/**
 * Source : La Chouette Agence Immobilière (lachouette.immo) — 3 place
 * Pellegrini, 06300 Nice. Plateforme La Boîte Immo : adaptateur générique
 * `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 2 locations, dont une dans la zone (garage à Saint-Laurent-du-Var) ; l'autre
 * (Roquebrune-Cap-Martin) est écartée au scoring. Gestion locative à Nice.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const laChouetteScraper = makeHektorScraper({
  id: 'la-chouette',
  name: 'La Chouette Agence Immobilière',
  domain: 'lachouette.immo',
  logo: 'https://www.lachouette.immo/images/favicon.png',
  agencyContact: {
    phone: '04 22 45 09 55', // secret-scan-ignore
    email: 'contact@lachouette.immo', // secret-scan-ignore
    address: { street: '3 place Pellegrini', postalCode: '06300', city: 'Nice' },
  },
  listUrls: ['https://www.lachouette.immo/location/1'],
});
