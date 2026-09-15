/**
 * Source : Marchal Immobilier (marchal-immobilier.fr) — 83 boulevard Gambetta,
 * 06000 Nice. Nouveau gabarit AdaptImmo : `../adaptimmo/v2-scraper.ts`.
 *
 * robots.txt vérifié le 2026-09-15 : /admin/, /private/ et /tmp/ interdits ;
 * celui de reach.adaptimmo.com n'interdit rien. 7 locations à Nice au relevé
 * (6 appartements, un stationnement).
 */

import { makeAdaptImmoV2Scraper } from '../adaptimmo/v2-scraper.js';

export const marchalImmobilierScraper = makeAdaptImmoV2Scraper({
  id: 'marchal-immobilier',
  name: 'Marchal Immobilier',
  domain: 'marchal-immobilier.fr',
  agencyNumber: '06024',
  listUrl:
    'https://www.marchal-immobilier.fr/fr/liste-location?perPage=48&etatBien=1&tdp=4&idfiltre=all',
  agencyContact: {
    phone: '04 93 51 43 12', // secret-scan-ignore
    email: 'contact@marchal-immobilier.fr', // secret-scan-ignore
    address: { street: '83 boulevard Gambetta', postalCode: '06000', city: 'Nice' },
  },
});
