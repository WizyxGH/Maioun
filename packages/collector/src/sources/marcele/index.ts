/**
 * Source : Marcele Immobilier (ballestri-immobilier.com) — 2 avenue Georges
 * Clemenceau, 06000 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * Ex-Ballestri : ses mentions légales la nomment, son site de marque est un
 * WordPress. 6 locations à Nice. L’ancien domaine peut disparaître après le
 * changement de nom.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const marceleScraper = makeApimoScraper({
  id: 'marcele',
  name: 'Marcele Immobilier',
  domain: 'ballestri-immobilier.com',
  agencyContact: {
    address: { street: '2 avenue Georges Clemenceau', postalCode: '06000', city: 'Nice' },
  },
  sitemapUrl: 'https://ballestri-immobilier.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
