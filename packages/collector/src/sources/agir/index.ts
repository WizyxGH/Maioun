/**
 * Source : Cabinet AGIR (agir.immo) — 2 rue Maréchal Joffre, 06000 Nice.
 * Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 2 locations (Nice, Le Rouret). Écartée le 2026-09-05 pour son volume : toute
 * agence qui loue dans la zone est désormais gardée.
 *
 * Recompté le 2026-09-17 : le site titre lui-même « 2 annonces de logements à
 * louer », sans seconde page, et le sitemap n'en référence pas d'autre. Ces
 * deux-là sont donc tout le catalogue — l'agence loue peu, mais vite : trois
 * nouveautés en trois semaines pour deux biens affichés. Les deux locaux
 * commerciaux de `/location-pro/` ne sont pas des logements.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const agirScraper = makeHektorScraper({
  id: 'agir',
  name: 'Cabinet A.G.I.R.',
  domain: 'agir.immo',
  agencyContact: {
    address: { street: '2 rue Maréchal Joffre', postalCode: '06000', city: 'Nice' },
  },
  logo: 'https://www.agir.immo/images/favicon.png',
  listUrls: ['https://www.agir.immo/location/1'],
});
