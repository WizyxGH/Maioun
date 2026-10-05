/**
 * Source : Agence Tosca Nice le Port (agencetosca.com) — 13 rue Cassini, 06300
 * Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-15 : robots.txt n'interdit que /app_dev.php, sitemap
 * déclaré. 102 ventes ; les deux fiches de location du sitemap datent de 2022
 * et 2025 et sont écartées par la limite d'âge. Gardée pour les biens à venir.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const toscaNiceLePortScraper = makeApimoScraper({
  id: 'tosca-nice-le-port',
  name: 'Agence Tosca Nice le Port',
  domain: 'agencetosca.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Zenia/1689/media/a42e1905b0289066132566cf389cdaf5.png',
  sitemapUrl: 'https://www.agencetosca.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  agencyContact: {
    phone: '04 92 04 45 28', // secret-scan-ignore
    email: 'niceleport@agencetosca.com', // secret-scan-ignore
    address: { street: '13 rue Cassini', postalCode: '06300', city: 'Nice' },
  },
});
