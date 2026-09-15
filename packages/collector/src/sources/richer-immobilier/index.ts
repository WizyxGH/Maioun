/**
 * Source : Richer Immobilier — voir `parser.ts`.
 *
 * Une page de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : absent (404), donc rien d'interdit. 1
 * location à Nice (Port) au relevé, sur 7 biens publiés.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { AGENCY_NAME, LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 6;

export const RICHER_IMMOBILIER_DESCRIPTOR: SourceDescriptor = {
  id: 'richer-immobilier',
  name: AGENCY_NAME,
  domain: 'richerimmobilier.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  agencyContact: {
    phone: '04 93 89 68 82', // secret-scan-ignore
    email: 'contact@richerimmobilier.com', // secret-scan-ignore
    address: { street: '50 boulevard Stalingrad', postalCode: '06300', city: 'Nice' },
  },
  allowedPaths: ['/rl_property/*'],
  notes:
    'WordPress + Retro Listings. robots.txt absent au 2026-09-15. Liste ' +
    '?filter_cat=2 (Location), fiches /rl_property/{slug}/ à libellés « Ville: », ' +
    '« Zipcode: », « Surface: » ; charges, dépôt et honoraires dans la description.',
};

export const richerImmobilierScraper: Scraper = {
  descriptor: RICHER_IMMOBILIER_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: RICHER_IMMOBILIER_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
