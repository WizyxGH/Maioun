/**
 * Source : MK Immo — voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-14 : aucune règle, sitemap déclaré. 10
 * locations au relevé, dont 6 dans la zone (Nice ×4, Cagnes, Villeneuve-Loubet) ;
 * les autres communes sont écartées au scoring.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const MK_IMMO_DESCRIPTOR: SourceDescriptor = {
  id: 'mk-immo',
  name: 'MK Immo',
  domain: 'mk-immo.fr',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/toutes-locations.html', '/*.html'],
  notes:
    'Site Twimmo, rendu serveur. robots.txt vérifié le 2026-09-14 : aucune ' +
    'règle. Liste /toutes-locations.html (une page), fiches …-{réf}.html dont ' +
    'les montants sont des phrases engendrées (loyer CC, provision, honoraires, dépôt).',
};

export const mkImmoScraper: Scraper = {
  descriptor: MK_IMMO_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: MK_IMMO_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
