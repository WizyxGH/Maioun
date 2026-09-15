/**
 * Source : Groupe Marshall (cabinet-marshall.com) — 4 rue de la Liberté, 06000
 * Nice ; `groupe-marshall.com` y redirige. Plateforme La Boîte Immo :
 * adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme. 6 fiches, dont
 * 5 dans la zone (Nice ×3, Cagnes, Saint-Laurent-du-Var) et une en Corse.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const groupeMarshallScraper = makeHektorScraper({
  id: 'groupe-marshall',
  name: 'Groupe Marshall',
  domain: 'cabinet-marshall.com',
  agencyContact: { address: { street: '4 rue de la Liberté', postalCode: '06000', city: 'Nice' } },
  logo: 'https://www.cabinet-marshall.com/images/favicon.png',
  listUrls: ['https://www.cabinet-marshall.com/location/1'],
});
