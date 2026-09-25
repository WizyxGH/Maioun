/**
 * Source : La Petite Maison (la-petitemaison.fr) — 301 chemin de la
 * Ginestière, 06200 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php, sitemap
 * déclaré. /fr/locations vide et aucune fiche de location au sitemap ce
 * jour-là ; gardée pour les biens à venir.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const laPetiteMaisonScraper = makeApimoScraper({
  id: 'la-petite-maison',
  name: 'La Petite Maison',
  domain: 'la-petitemaison.fr',
  sitemapUrl: 'https://la-petitemaison.fr/sitemap.xml',
  listUrls: ['https://la-petitemaison.fr/fr/locations'],
  citySlugs: NICE_AREA_SLUGS,
  agencyContact: {
    phone: '06 38 53 34 17', // secret-scan-ignore
    email: 'sophie.bihoue@la-petitemaison.fr', // secret-scan-ignore
    address: { street: '301 chemin de la Ginestière', postalCode: '06200', city: 'Nice' },
  },
});
