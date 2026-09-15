/**
 * Source : French Riviera Studios — voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 (Yoast) : aucune règle, sitemap déclaré. 20
 * locations à Nice au relevé, meublées ou étudiantes pour la plupart.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const FRENCH_RIVIERA_STUDIOS_DESCRIPTOR: SourceDescriptor = {
  id: 'french-riviera-studios',
  name: 'French Riviera Studios',
  domain: 'studios-nice.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/status/location/', '/property/*'],
  agencyContact: {
    phone: '04 92 04 25 35', // secret-scan-ignore
    email: 'contact@frenchrivierastudios.com', // secret-scan-ignore
    address: { street: '2 place Magenta', postalCode: '06000', city: 'Nice' },
  },
  notes:
    'WordPress (thème Houzez), rendu serveur. robots.txt vérifié le 2026-09-15 : ' +
    'aucune règle. Liste /status/location/ (une page), fiches /property/{slug}/ ' +
    'avec JSON-LD RealEstateListing et tableau Détails (prix au mois, charges, dépôt).',
};

export const frenchRivieraStudiosScraper: Scraper = {
  descriptor: FRENCH_RIVIERA_STUDIOS_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: FRENCH_RIVIERA_STUDIOS_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
