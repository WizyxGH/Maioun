/**
 * Source : Aparté Immobilier (aparte-immobilier.com) — 47 rue Rossini,
 * 06000 Nice. Plateforme Apimo : adaptateur `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php, sitemap
 * déclaré. 4 logements à louer à Nice (Carré d'Or, Cimiez) et un local
 * commercial, écarté par l'adaptateur.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const aparteImmobilierScraper = makeApimoScraper({
  id: 'aparte-immobilier',
  name: 'Aparté Immobilier',
  domain: 'aparte-immobilier.com',
  sitemapUrl: 'https://aparte-immobilier.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  agencyContact: {
    phone: '04 93 85 04 57', // secret-scan-ignore
    email: 'info@aparte-immobilier.com', // secret-scan-ignore
    address: { street: '47 rue Rossini', postalCode: '06000', city: 'Nice' },
  },
});
