/**
 * Source : L'Agence (l-agence.fr), société Euro'Pin — 48 boulevard Jean Jaurès,
 * 06300 Nice. Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits). 2
 * locations (Nice Port, Villeneuve-Loubet), descriptions complètes.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const lagenceJeanJauresScraper = makeHektorScraper({
  id: 'lagence-jean-jaures',
  name: 'L’Agence Jean Jaurès',
  domain: 'l-agence.fr',
  logo: 'https://www.l-agence.fr/images/favicon.png',
  agencyContact: {
    phone: '04 93 62 72 32', // secret-scan-ignore
    email: 'immo@lagence06.com', // secret-scan-ignore
    address: { street: '48 boulevard Jean Jaurès', postalCode: '06300', city: 'Nice' },
  },
  listUrls: ['https://www.l-agence.fr/location/1'],
});
