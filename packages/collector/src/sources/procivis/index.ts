/**
 * Source : Procivis / Immo de France — voir `parser.ts`.
 *
 * Deux pages de liste par passage (appartements et maisons des Alpes-Maritimes), puis les
 * fiches des annonces nouvelles. robots.txt vérifié le 2026-09-14 : interdit
 * les recherches à paramètres (`/louer?*`, `/agences?*`) et `*\/rental$` ; les
 * pages par type et commune et les fiches ne le sont pas. Le sitemap (3 Mo)
 * n'est pas lu. 7 appartements dans le département au relevé, dont 4 à Nice.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URLS, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 6;

export const PROCIVIS_DESCRIPTOR: SourceDescriptor = {
  id: 'procivis',
  name: 'Immo de France Côte d’Azur',
  domain: 'procivis.fr',
  kind: 'agencyNetwork',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('agencyNetwork'),
  budget: budgetFor('agencyNetwork', { maxPagesPerRun: LIST_URLS.length + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/louer/appartements/*', '/louer/maisons/*'],
  notes:
    'Réseau Procivis (ex-Immo de France). robots.txt vérifié le 2026-09-14 : ' +
    '/louer?*, /agences?* et */rental$ interdits, non utilisés. Pages par type ' +
    'et commune en rendu serveur ; fiche en JSON-LD RealEstateListing.',
};

export const procivisScraper: Scraper = {
  descriptor: PROCIVIS_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: PROCIVIS_DESCRIPTOR.id,
      listUrls: LIST_URLS,
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
