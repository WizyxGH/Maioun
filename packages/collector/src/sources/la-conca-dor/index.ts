/**
 * Source : La Conca d’Or (laconcador.com) — 466 boulevard Léon Sauvan, 06690
 * Tourrette-Levens. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 1 location à Nice.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const laConcaDorScraper = makeApimoScraper({
  id: 'la-conca-dor',
  name: 'La Conca d’Or',
  domain: 'laconcador.com',
  agencyContact: {
    address: { street: '466 boulevard Léon Sauvan', postalCode: '06690', city: 'Tourrette-Levens' },
  },
  sitemapUrl: 'https://laconcador.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://laconcador.com/fr/location'],
});
