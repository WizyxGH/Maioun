/**
 * Source : FDS Immobilier Carré d’Or (fdscarredor.com) — 53 rue de France,
 * 06000 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 10 locations à Nice au sitemap.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const fdsCarreDorScraper = makeApimoScraper({
  id: 'fds-carre-dor',
  name: 'FDS Immobilier Carré d’Or',
  domain: 'fdscarredor.com',
  agencyContact: { address: { street: '53 rue de France', postalCode: '06000', city: 'Nice' } },
  sitemapUrl: 'https://fdscarredor.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://fdscarredor.com/fr/locations'],
});
