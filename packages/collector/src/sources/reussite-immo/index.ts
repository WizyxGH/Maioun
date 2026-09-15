/**
 * Source : Réussite Immo Nice (immonice06.fr) — 6 rue Massenet, 06000 Nice.
 * Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 5 locations ciblées (Nice ×4, un commerce à Cagnes).
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const reussiteImmoScraper = makeApimoScraper({
  id: 'reussite-immo',
  name: 'Réussite Immo Nice',
  domain: 'immonice06.fr',
  agencyContact: { address: { street: '6 rue Massenet', postalCode: '06000', city: 'Nice' } },
  sitemapUrl: 'https://immonice06.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
