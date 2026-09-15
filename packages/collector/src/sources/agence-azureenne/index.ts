/**
 * Source : L'Agence Azuréenne (lagenceazureenne.com) — 157 avenue de Nice,
 * 06800 Cagnes-sur-Mer. Plateforme La Boîte Immo : adaptateur générique
 * `../hektor/`.
 *
 * Vérifié le 2026-09-15 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits). 2
 * locations (Nice Californie, Villeneuve-Loubet), descriptions complètes.
 * Demandée par l'utilisateur.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const agenceAzureenneScraper = makeHektorScraper({
  id: 'agence-azureenne',
  name: 'L’Agence Azuréenne',
  domain: 'lagenceazureenne.com',
  logo: 'https://www.lagenceazureenne.com/images/favicon.png',
  agencyContact: {
    phone: '04 93 56 15 75', // secret-scan-ignore
    email: 'info@lagenceazureenne.com', // secret-scan-ignore
    address: { street: '157 avenue de Nice', postalCode: '06800', city: 'Cagnes-sur-Mer' },
  },
  listUrls: ['https://www.lagenceazureenne.com/location/1'],
});
