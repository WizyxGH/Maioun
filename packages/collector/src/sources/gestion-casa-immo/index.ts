/**
 * Source : Gestion Casa Immobilière (gestion-casa-immo.com) — Résidence Le Pont
 * Neuf, 49 rue Gioffredo, 06000 Nice. Plateforme La Boîte Immo : adaptateur
 * générique `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 4 locations (Nice ×3 dont un garage, Saint-Laurent-du-Var).
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const gestionCasaImmoScraper = makeHektorScraper({
  id: 'gestion-casa-immo',
  name: 'Gestion Casa Immobilière',
  domain: 'gestion-casa-immo.com',
  logo: 'https://www.gestion-casa-immo.com/images/favicon.png',
  agencyContact: {
    phone: '07 62 15 30 00', // secret-scan-ignore
    address: { street: '49 rue Gioffredo', postalCode: '06000', city: 'Nice' },
  },
  listUrls: ['https://www.gestion-casa-immo.com/location/1'],
});
