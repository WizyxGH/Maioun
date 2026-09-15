/**
 * Source : Agence Californie (agencecalifornie.fr) — 229 avenue de la
 * Californie, 06200 Nice. WordPress/RealHomes, voir `parser.ts`.
 *
 * Deux requêtes de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : pour tous les robots, seuls /wp-json/ et
 * ?rest_route= sont interdits. 9 locations au relevé, dont 2 logements à Nice ;
 * bureaux, commerces et terrains sont écartés au scoring.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URLS, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const AGENCE_CALIFORNIE_DESCRIPTOR: SourceDescriptor = {
  id: 'agence-californie',
  name: 'Agence Californie',
  domain: 'agencecalifornie.fr',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: LIST_URLS.length + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/recherche-de-biens/*', '/bien/*'],
  agencyContact: {
    phone: '04 93 83 79 59', // secret-scan-ignore
    address: { street: '229 avenue de la Californie', postalCode: '06200', city: 'Nice' },
  },
  notes:
    'WordPress, thème RealHomes, rendu serveur. robots.txt vérifié le ' +
    '2026-09-15 : seuls /wp-json/ et ?rest_route= interdits. Recherche ' +
    '?status=a-louer sur deux pages, fiches /bien/{slug}-{réf}-{cp}/.',
};

export const agenceCalifornieScraper: Scraper = {
  descriptor: AGENCE_CALIFORNIE_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: AGENCE_CALIFORNIE_DESCRIPTOR.id,
      listUrls: LIST_URLS,
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
