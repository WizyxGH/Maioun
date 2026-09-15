/**
 * Source : Domi Nice Immobilier (dominiceimmobilier.com) — 24 rue Gioffredo,
 * 06000 Nice. Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits). Agence
 * de transaction : la page /location/1 existe mais ne porte au relevé qu'une
 * annonce de test de la plateforme (terrain à Paris, écarté au scoring) —
 * suivie en attente.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const domiNiceImmobilierScraper = makeHektorScraper({
  id: 'domi-nice-immobilier',
  name: 'Domi Nice Immobilier',
  domain: 'dominiceimmobilier.com',
  agencyContact: {
    address: { street: '24 rue Gioffredo', postalCode: '06000', city: 'Nice' },
  },
  listUrls: ['https://www.dominiceimmobilier.com/location/1'],
});
