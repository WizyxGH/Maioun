/**
 * Source : Immobilière Roseland (immobiliereroseland.fr) — 38 rue Auguste Gal,
 * 06300 Nice. Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 8 locations à Nice sur 10 fiches (Beausoleil, Pierrefeu en plus). La page 2
 * est lue par précaution : la liste pagine par dix.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const roselandScraper = makeHektorScraper({
  id: 'roseland',
  name: 'Immobilière Roseland',
  domain: 'immobiliereroseland.fr',
  agencyContact: { address: { street: '38 rue Auguste Gal', postalCode: '06300', city: 'Nice' } },
  logo: 'https://www.immobiliereroseland.fr/images/favicon.png',
  listUrls: [
    'https://www.immobiliereroseland.fr/location/1',
    'https://www.immobiliereroseland.fr/location/2',
  ],
});
