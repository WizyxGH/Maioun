/**
 * Source : Cabinet Griguer — voir `parser.ts`.
 *
 * Une requête de recherche par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-14 : seul /wp-admin/ est interdit. 7 locations
 * à Nice au relevé (4 logements, un local, deux stationnements).
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const GRIGUER_DESCRIPTOR: SourceDescriptor = {
  id: 'griguer',
  name: 'Cabinet Griguer',
  domain: 'griguer-immobilier.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/recherche-avancee/', '/biens/*'],
  notes:
    'WordPress + Essential Real Estate. robots.txt vérifié le 2026-09-14 : seul ' +
    '/wp-admin/ interdit. Recherche ?status=location, fiches /biens/{slug}/ ; ' +
    'statut et commune dans les classes, montants dans la « Vue d’ensemble ».',
};

export const griguerScraper: Scraper = {
  descriptor: GRIGUER_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: GRIGUER_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
