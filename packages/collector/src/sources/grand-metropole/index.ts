/**
 * Source : Grand Métropole — voir `parser.ts`.
 *
 * Une page de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : rien d'interdit, sitemap Yoast déclaré.
 * 13 locations publiées au relevé, dont 12 marquées « Loué » : reste une
 * chambre en colocation à Nice (Saint-Augustin).
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { AGENCY_NAME, LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 6;

export const GRAND_METROPOLE_DESCRIPTOR: SourceDescriptor = {
  id: 'grand-metropole',
  name: AGENCY_NAME,
  domain: 'gdmetropole.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  agencyContact: {
    phone: '06 27 11 84 47', // secret-scan-ignore
    email: 'contact@grandmetropole.com', // secret-scan-ignore
    address: { street: '8 boulevard Victor Hugo', postalCode: '06000', city: 'Nice' },
  },
  allowedPaths: ['/locations/', '/admo-biens/*'],
  notes:
    'WordPress + Elementor/JetEngine. robots.txt sans interdiction au 2026-09-15. ' +
    'Liste /locations/ d’un bloc, biens « Loué » et bureaux écartés ; fiches ' +
    '/admo-biens/{slug}/, statut dans les classes du gabarit.',
};

export const grandMetropoleScraper: Scraper = {
  descriptor: GRAND_METROPOLE_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: GRAND_METROPOLE_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
