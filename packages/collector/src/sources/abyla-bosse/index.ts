/**
 * Source : Abyla Bosse (immobiliere-abc.com), Cabinet Bosse — 4 avenue Georges
 * Clemenceau, 06000 Nice. Plateforme Apimo, URLs « à barres »
 * (`/fr/propriete/location/{type}/{ville}/{slug}/{réf}`) : adaptateur `../apimo/`.
 *
 * robots.txt vérifié le 2026-09-15 : seul /app_dev.php interdit, sitemap
 * déclaré. 5 logements à louer à Nice au relevé (Gambetta, Fabron, Port,
 * Garibaldi, Masséna).
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const abylaBosseScraper = makeApimoScraper({
  id: 'abyla-bosse',
  name: 'Abyla Bosse',
  domain: 'immobiliere-abc.com',
  agencyContact: {
    phone: '04 93 82 37 46', // secret-scan-ignore
    email: 'commercial@abylabosse.com', // secret-scan-ignore
    address: { street: '4 avenue Georges Clemenceau', postalCode: '06000', city: 'Nice' },
  },
  sitemapUrl: 'https://immobiliere-abc.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://immobiliere-abc.com/fr/locations'],
});
