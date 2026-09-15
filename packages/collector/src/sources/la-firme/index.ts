/**
 * Source : La Firme (proazurdagasso.com) — 12 rue Gioffredo, 06000 Nice.
 * Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 1 location à Nice (une chambre en colocation). Le domaine ne porte pas le
 * nom de l’enseigne, que le site affiche.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const laFirmeScraper = makeApimoScraper({
  id: 'la-firme',
  name: 'La Firme',
  domain: 'proazurdagasso.com',
  agencyContact: { address: { street: '12 rue Gioffredo', postalCode: '06000', city: 'Nice' } },
  sitemapUrl: 'https://proazurdagasso.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
});
