/**
 * Source : Agence Gounod (agencegounod.com) — 19 rue Gounod, 06000 Nice.
 * Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-16 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 40 locations au sitemap (Nice 39, Saint-Laurent-du-Var), dont une quinzaine
 * dans le quartier des Musiciens, où l’agence tient boutique depuis 1980. Le
 * saisonnier vit sous `/fr/propriete-saisonniere/`, que l’adaptateur ignore.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const agenceGounodScraper = makeApimoScraper({
  id: 'agence-gounod',
  name: 'Agence Gounod',
  domain: 'agencegounod.com',
  agencyContact: { address: { street: '19 rue Gounod', postalCode: '06000', city: 'Nice' } },
  sitemapUrl: 'https://agencegounod.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
