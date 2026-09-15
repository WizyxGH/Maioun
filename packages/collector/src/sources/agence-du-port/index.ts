/**
 * Source : Agence du Port de Nice (agenceduportdenice.fr) — 28 boulevard
 * Stalingrad, 06300 Nice. Plateforme ICS : adaptateur générique `../ics/`.
 *
 * Vérifié le 2026-09-15 : robots.txt autorise tout. La page de résultats en
 * vente porte bien le `var properties` attendu ; en location, « aucun
 * résultats » ce jour-là. Gardée pour les biens à venir (syndic et gérance).
 */

import { makeIcsScraper } from '../ics/scraper.js';

export const agenceDuPortScraper = makeIcsScraper({
  id: 'agence-du-port',
  name: 'Agence du Port de Nice',
  domain: 'agenceduportdenice.fr',
  agencyContact: {
    phone: '04 93 26 69 71', // secret-scan-ignore
    email: 'contact@sncagenceduport.fr', // secret-scan-ignore
    address: { street: '28 boulevard Stalingrad', postalCode: '06300', city: 'Nice' },
  },
  listUrl: 'https://www.agenceduportdenice.fr/resultats?transac=location',
});
