/**
 * Source : Masséna Immobilier (massena-immo.com) — 12 avenue Félix Faure,
 * 06000 Nice. Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 * 39 locations ciblées au sitemap, toutes de 2026 (Nice 32, Villeneuve-Loubet,
 * Cagnes, Cap-d’Ail, Saint-Laurent-du-Var, Contes).
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const massenaImmoScraper = makeApimoScraper({
  id: 'massena-immo',
  name: 'Masséna Immobilier',
  domain: 'massena-immo.com',
  logo: 'https://d36vnx92dgl2c5.cloudfront.net/prod/Elone/3620/media/6e98366ef367546b36d867b32fdabb35.jpeg',
  agencyContact: {
    address: { street: '12 avenue Félix Faure', postalCode: '06000', city: 'Nice' },
  },
  sitemapUrl: 'https://massena-immo.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://massena-immo.com/fr/locations'],
});
