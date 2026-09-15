/**
 * Source : MK Immo (mk-immo.fr) — 165 avenue de Nice, 06800 Cagnes-sur-Mer ;
 * `mce-immo.com` y redirige. Site Twimmo, voir `../twimmo/`.
 *
 * robots.txt vérifié le 2026-09-14 : aucune règle, sitemap déclaré. 10
 * locations au relevé, dont 6 dans la zone (Nice ×4, Cagnes, Villeneuve-Loubet) ;
 * les autres communes sont écartées au scoring.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { makeTwimmoScraper } from '../twimmo/scraper.js';

export const mkImmoScraper: Scraper = makeTwimmoScraper({
  id: 'mk-immo',
  name: 'MK Immo',
  siteUrl: 'https://www.mk-immo.fr',
  notes:
    'Site Twimmo, rendu serveur. robots.txt vérifié le 2026-09-14 : aucune ' +
    'règle. Liste /toutes-locations.html (une page), fiches …-{réf}.html dont ' +
    'les montants sont des phrases engendrées (loyer CC, provision, honoraires, dépôt).',
});

export const MK_IMMO_DESCRIPTOR: SourceDescriptor = mkImmoScraper.descriptor;
