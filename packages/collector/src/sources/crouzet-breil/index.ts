/**
 * Source : Cabinet Crouzet & Breil — voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-14 : aucune règle. 7 locations au relevé,
 * toutes à Nice (dont un box et un bail étudiant).
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const CROUZET_BREIL_DESCRIPTOR: SourceDescriptor = {
  id: 'crouzet-breil',
  name: 'Cabinet Crouzet & Breil',
  domain: 'crouzet-breil.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/type-offre/location/', '/l_immobilier/*'],
  notes:
    'WordPress + Elementor alimenté par Apimo. robots.txt vérifié le 2026-09-14 : ' +
    'aucune règle. Liste /type-offre/location/, fiches /l_immobilier/{slug}/ : ' +
    'résumé engendré (pièces, surface, loyer CC, réf.) et détails « Libellé: valeur ».',
};

export const crouzetBreilScraper: Scraper = {
  descriptor: CROUZET_BREIL_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: CROUZET_BREIL_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
