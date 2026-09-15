/**
 * Source : Cabinet Loquis (loquis.fr) — 3 place Alexandre Médecin, 06100 Nice.
 * WordPress/WPCasa, voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : aucune interdiction, mais `Crawl-delay:
 * 10`, que le client HTTP applique de lui-même. Page des locations vide au
 * relevé (5 ventes) : suivie en attente.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { AGENCY_NAME, LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const LOQUIS_DESCRIPTOR: SourceDescriptor = {
  id: 'loquis',
  name: AGENCY_NAME,
  domain: 'loquis.fr',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/location/', '/listing/*'],
  agencyContact: {
    phone: '04 93 51 82 16', // secret-scan-ignore
    address: { street: '3 place Alexandre Médecin', postalCode: '06100', city: 'Nice' },
  },
  notes:
    'WordPress, thème Beaver Builder + WPCasa, rendu serveur. robots.txt ' +
    'vérifié le 2026-09-15 : aucune interdiction, Crawl-delay 10 (appliqué par ' +
    'le client HTTP).Liste /location/ (offre « à louer », cartes #listing-{id}), ' +
    'fiches /listing/{slug}/ ; montants et DPE lus dans la description.',
};

export const loquisScraper: Scraper = {
  descriptor: LOQUIS_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: LOQUIS_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
