/**
 * Source : Acetimo (acetimo.com) — 1 avenue Mirabeau, 06000 Nice. Plateforme
 * Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php, sitemap
 * déclaré. 24 ventes, aucune location ce jour-là ; le sitemap les listerait
 * sous `/fr/propriete/location+…`. Gardée pour les biens à venir.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const acetimoScraper = makeApimoScraper({
  id: 'acetimo',
  name: 'Acetimo',
  domain: 'acetimo.com',
  sitemapUrl: 'https://acetimo.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  agencyContact: {
    phone: '04 93 62 62 08', // secret-scan-ignore
    email: 'contact@acetimo.com', // secret-scan-ignore
    address: { street: '1 avenue Mirabeau', postalCode: '06000', city: 'Nice' },
  },
});
