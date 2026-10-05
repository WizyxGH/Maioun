/**
 * Source : Provencalpes (provencalpes.fr) — Blausasc. Plateforme Apimo :
 * adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 4 locations ciblées (Nice ×2, Contes, Drap). Le saisonnier est sous
 * `/fr/propriete-saisonniere/`, que l’adaptateur ignore.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const provencalpesScraper = makeApimoScraper({
  id: 'provencalpes',
  name: 'Provencalpes',
  domain: 'provencalpes.fr',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Elone/1800/media/8c81d88fb722abb9151802dec96b0c1b.png',
  sitemapUrl: 'https://provencalpes.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://provencalpes.fr/fr/locations'],
});
