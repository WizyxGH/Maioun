/**
 * Source : BBii — Bérenguer & Bérenguer Immobilier International (bbii.fr),
 * siège à Nice, bureaux à Saint-Jean-Cap-Ferrat et dans le Var : pas de
 * coordonnées d'agence unique. Site Twimmo, voir `../twimmo/`.
 *
 * robots.txt vérifié le 2026-09-15 : il ne vise que des robots nommés, aucune
 * règle pour le nôtre. Surtout de la vente : « 0 bien trouvé » en location ce
 * jour-là ; gardée pour les locations à venir.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { makeTwimmoScraper } from '../twimmo/scraper.js';

export const bbiiScraper: Scraper = makeTwimmoScraper({
  id: 'bbii',
  name: 'BBii',
  siteUrl: 'https://www.bbii.fr',
  notes:
    'Site Twimmo, rendu serveur. robots.txt vérifié le 2026-09-15 : aucune ' +
    'règle pour notre robot. Liste /toutes-locations.html (une page, vide au ' +
    'relevé), fiches …-{réf}.html aux montants en phrases engendrées.',
});

export const BBII_DESCRIPTOR: SourceDescriptor = bbiiScraper.descriptor;
