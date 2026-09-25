/**
 * Source : Transactimo (transactimo-nice.com) — 19 avenue Georges Clemenceau,
 * 06000 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php, sitemap
 * déclaré. /fr/locations vide et sitemap sans fiche de location ce jour-là
 * (8 ventes) ; gardée pour les biens à venir.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const transactimoScraper = makeApimoScraper({
  id: 'transactimo',
  name: 'Transactimo',
  domain: 'transactimo-nice.com',
  sitemapUrl: 'https://transactimo-nice.com/sitemap.xml',
  listUrls: ['https://transactimo-nice.com/fr/locations'],
  citySlugs: NICE_AREA_SLUGS,
  agencyContact: {
    phone: '04 93 88 56 61', // secret-scan-ignore
    email: 'contact@transactimo-nice.com', // secret-scan-ignore
    address: { street: '19 avenue Georges Clemenceau', postalCode: '06000', city: 'Nice' },
  },
});
