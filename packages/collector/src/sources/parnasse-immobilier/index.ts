/**
 * Source : Parnasse Immobilier (parnasse-immobilier.com) — 10 avenue Georges
 * Clemenceau, 06000 Nice. WordPress/WPResidence, voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : seul /wp-admin/ est interdit. 8 locations
 * au relevé : 3 appartements à Nice, des stationnements et un commerce à
 * Valberg (écartés au scoring).
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const PARNASSE_IMMOBILIER_DESCRIPTOR: SourceDescriptor = {
  id: 'parnasse-immobilier',
  name: 'Parnasse Immobilier',
  domain: 'parnasse-immobilier.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/nos-annonces-location/', '/immobilier/*'],
  agencyContact: {
    phone: '04 93 78 16 48', // secret-scan-ignore
    email: 'info@parnasse-immobilier.com', // secret-scan-ignore
    address: { street: '10 avenue Georges Clemenceau', postalCode: '06000', city: 'Nice' },
  },
  notes:
    'WordPress, thème WPResidence, rendu serveur. robots.txt vérifié le ' +
    '2026-09-15 : seul /wp-admin/ interdit. Liste /nos-annonces-location/ ' +
    '(cartes data-listid), fiches /immobilier/{slug}/ à blocs listing_detail.',
};

export const parnasseImmobilierScraper: Scraper = {
  descriptor: PARNASSE_IMMOBILIER_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: PARNASSE_IMMOBILIER_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
