/**
 * Source : SAFI Méditerranée — voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-14 : interdit notamment `/*?*`, /search/ et
 * /wp-json/, non utilisés. 3 locations au mois à Nice au relevé, plus des
 * chalets à la semaine à Tende, écartés.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 6;

export const SAFI_DESCRIPTOR: SourceDescriptor = {
  id: 'safi',
  name: 'SAFI Méditerranée',
  domain: 'safimediterranee.fr',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/status/location/', '/property/*'],
  notes:
    'WordPress + Houzez alimenté par Apimo. robots.txt vérifié le 2026-09-14 : ' +
    'paramètres, recherche et wp-json interdits, non utilisés. Liste ' +
    '/status/location/, fiches /property/{slug}/ en liste Houzez.',
};

export const safiScraper: Scraper = {
  descriptor: SAFI_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: SAFI_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
