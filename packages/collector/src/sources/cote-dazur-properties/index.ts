/**
 * Source : Côte d'Azur Properties (immobilierniceouest.com) — 2 boulevard
 * Carlone, 06200 Nice. WordPress/Houzez, voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : aucune interdiction. Aucune location au
 * relevé (8 ventes) : suivie en attente.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { AGENCY_NAME, isEmptyList, LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const COTE_DAZUR_PROPERTIES_DESCRIPTOR: SourceDescriptor = {
  id: 'cote-dazur-properties',
  name: AGENCY_NAME,
  domain: 'immobilierniceouest.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/search-results/', '/property/*'],
  agencyContact: {
    phone: '04 89 74 90 00', // secret-scan-ignore
    address: { street: '2 boulevard Carlone', postalCode: '06200', city: 'Nice' },
  },
  notes:
    'WordPress, thème Houzez (fiche v6), rendu serveur. robots.txt vérifié le ' +
    '2026-09-15 : aucune interdiction. Recherche ?status[]=a-louer, fiches ' +
    '/property/{slug}/ ; montants lus dans le bloc « Informations légales ».',
};

export const coteDazurPropertiesScraper: Scraper = {
  descriptor: COTE_DAZUR_PROPERTIES_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: COTE_DAZUR_PROPERTIES_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      isEmptyList,
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
