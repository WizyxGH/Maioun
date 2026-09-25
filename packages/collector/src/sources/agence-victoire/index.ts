/**
 * Source : Agence de la Victoire (agence-victoire-nice.com) — agence niçoise
 * indépendante sur la plateforme Apimo/Cello (§47).
 *
 * Identifiée par l'inventaire des agences Apimo du 2026-08-17 (via les pages
 * « agence-apimo » de Bien'ici). robots.txt revérifié le 2026-08-17 : signature
 * Apimo exacte (seul /app_dev.php interdit, sitemap déclaré). ~25 locations à
 * Nice dans le sitemap au moment de l'étude.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const agenceVictoireScraper = makeApimoScraper({
  id: 'agence-victoire',
  name: 'Agence de la Victoire',
  domain: 'agence-victoire-nice.com',
  sitemapUrl: 'https://agence-victoire-nice.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://agence-victoire-nice.com/fr/locations'],
});
