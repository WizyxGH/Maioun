/**
 * Source : Immobilière Victor Hugo (immobilierevictorhugo.fr) — 15 boulevard
 * Victor Hugo, 06000 Nice. Plateforme Apimo : adaptateur générique
 * `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 1 location en ligne à Nice.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const victorHugoScraper = makeApimoScraper({
  id: 'victor-hugo',
  name: 'Immobilière Victor Hugo',
  domain: 'immobilierevictorhugo.fr',
  agencyContact: {
    address: { street: '15 boulevard Victor Hugo', postalCode: '06000', city: 'Nice' },
  },
  sitemapUrl: 'https://immobilierevictorhugo.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
