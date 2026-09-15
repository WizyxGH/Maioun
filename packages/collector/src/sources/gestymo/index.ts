/**
 * Source : Gestymo (gestymo.com) — 375 promenade des Anglais, 06200 Nice.
 * Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * Liste des locations vide ce jour-là ; gardée pour les biens à venir
 * (gestion locative à Nice).
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const gestymoScraper = makeHektorScraper({
  id: 'gestymo',
  name: 'Gestymo',
  domain: 'gestymo.com',
  logo: 'https://www.gestymo.com/images/favicon.png',
  agencyContact: {
    phone: '04 93 66 66 70', // secret-scan-ignore
    email: 'contact.gestymo@promofar.fr', // secret-scan-ignore
    address: { street: '375 promenade des Anglais', postalCode: '06200', city: 'Nice' },
  },
  listUrls: ['https://www.gestymo.com/location/1'],
});
