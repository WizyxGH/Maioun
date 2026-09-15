/**
 * Source : Platine Immobilier (platineimmobilier.eu) — 5 rue Blacas, 06100
 * Nice. La Boîte Immo, ancien gabarit (`/a-louer/1`, fiches `/{id}-{slug}.html`,
 * photos staticlbi) : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * « Aucun bien ne correspond » en location ce jour-là ; gardée pour les biens
 * à venir. Une fiche de vente se lit bien (surface, pièces, commune).
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const platineImmobilierScraper = makeHektorScraper({
  id: 'platine-immobilier',
  name: 'Platine Immobilier',
  domain: 'platineimmobilier.eu',
  logo: 'https://www.platineimmobilier.eu/images/favicon.png',
  agencyContact: {
    phone: '04 83 50 56 36', // secret-scan-ignore
    email: 'info@platineimmobilier.eu', // secret-scan-ignore
    address: { street: '5 rue Blacas', postalCode: '06100', city: 'Nice' },
  },
  listUrls: ['https://www.platineimmobilier.eu/a-louer/1'],
});
