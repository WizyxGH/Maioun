/**
 * Source : Agence 5 Promenade (5promenade.fr) — 5 promenade des Anglais, 06000
 * Nice. Apimo ancien schéma (`/fr/propriété/{id}`) : `../apimo/list-scraper.ts`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php. 3 fiches sur
 * /fr/locations : un studio meublé à Nice, un local commercial (écarté par le
 * parseur) et une ancienne fiche.
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const agence5PromenadeScraper = makeApimoListScraper({
  id: 'agence-5-promenade',
  name: 'Agence 5 Promenade',
  domain: '5promenade.fr',
  agencyContact: {
    phone: '04 93 82 93 82', // secret-scan-ignore
    email: 'contact@5promenade.com', // secret-scan-ignore
    address: { street: '5 promenade des Anglais', postalCode: '06000', city: 'Nice' },
  },
  listUrls: ['https://5promenade.fr/fr/locations'],
});
