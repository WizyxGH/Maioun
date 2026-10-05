/**
 * Source : Blue Résidences / Cimiez Résidences (blue-residences.fr) — Le
 * Majestic, 4 boulevard de Cimiez, 06000 Nice ; aussi 86 boulevard de Cimiez et
 * 12 avenue Cap de Croix. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php, sitemap
 * déclaré. 50 fiches de location au sitemap (Nice surtout, Cagnes-sur-Mer,
 * Saint-Laurent-du-Var), dont une partie déjà louées : la fiche le dit.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const blueResidencesScraper = makeApimoScraper({
  id: 'blue-residences',
  name: 'Blue Résidences',
  domain: 'blue-residences.fr',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Elone/3024/media/5775ec396d3a7402aee4e12c40121759.png',
  agencyContact: {
    phone: '04 93 79 28 71', // secret-scan-ignore
    address: { street: '4 boulevard de Cimiez', postalCode: '06000', city: 'Nice' },
  },
  sitemapUrl: 'https://blue-residences.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://blue-residences.fr/fr/locations'],
});
