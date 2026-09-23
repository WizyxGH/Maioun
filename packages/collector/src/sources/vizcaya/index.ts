/**
 * Source : Vizcaya Immobilier (vizcaya.fr) — 4 quai Papacino, 06300 Nice.
 * Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 24 locations ciblées au sitemap (Nice 22, Cagnes, Villefranche-sur-Mer).
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const vizcayaScraper = makeApimoScraper({
  id: 'vizcaya',
  name: 'Vizcaya Immobilier',
  domain: 'vizcaya.fr',
  agencyContact: { address: { street: '4 quai Papacino', postalCode: '06300', city: 'Nice' } },
  sitemapUrl: 'https://vizcaya.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://vizcaya.fr/fr/louer'],
});
