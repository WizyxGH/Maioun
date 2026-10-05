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
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const laFirmeScraper = makeApimoScraper({
  id: 'la-firme',
  name: 'La Firme',
  domain: 'proazurdagasso.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Bento/4826/media/b71d64404ce83e62d9f3b92e2f770205.png',
  agencyContact: { address: { street: '12 rue Gioffredo', postalCode: '06000', city: 'Nice' } },
  sitemapUrl: 'https://proazurdagasso.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://proazurdagasso.com/fr/louer'],
});
