/**
 * Source : Immo Riviera Transactions (immoriviera.fr, en http seulement) —
 * 11 ter rue du Congrès, 06000 Nice, et une seconde agence avenue de la
 * Californie. Surtout des ventes, mais son barème affiche des honoraires de
 * location : suivie en attente. Gabarit Apimo « free7 », voir `parser.ts`.
 *
 * robots.txt vérifié le 2026-09-15 : /q/*, impressions, formulaires,
 * /diagnostic/* et ?order= interdits ; la recherche et les fiches sont permises.
 * Aucune location au relevé.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { isEmptyList, listUrl, parseDetail, parseList, type ApimoFree7Site } from './parser.js';

const MAX_DETAILS = 8;

export const IMMO_RIVIERA_TRANSACTIONS: ApimoFree7Site = {
  agencyName: 'Immo Riviera Transactions',
  origin: 'http://www.immoriviera.fr',
};

export const IMMO_RIVIERA_TRANSACTIONS_DESCRIPTOR: SourceDescriptor = {
  id: 'immo-riviera-transactions',
  name: IMMO_RIVIERA_TRANSACTIONS.agencyName,
  domain: 'immoriviera.fr',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/fr/search/*'],
  notes:
    'Site Apimo « free7 », http seulement (certificat https d’un autre nom). ' +
    'robots.txt vérifié le 2026-09-15 : /q/*, /diagnostic/*, formulaires et ' +
    '?order= interdits. Recherche /fr/search/?nature=2 (location), fiches ' +
    '/fr/search/{slug}-{cp}-{id} ; deux agences à Nice (Congrès, Californie).',
};

export const immoRivieraTransactionsScraper: Scraper = {
  descriptor: IMMO_RIVIERA_TRANSACTIONS_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: IMMO_RIVIERA_TRANSACTIONS_DESCRIPTOR.id,
      listUrls: [listUrl(IMMO_RIVIERA_TRANSACTIONS)],
      parseList: (body) => parseList(body, IMMO_RIVIERA_TRANSACTIONS),
      isEmptyList,
      parseDetail: (html, listing) => parseDetail(html, listing, IMMO_RIVIERA_TRANSACTIONS),
      maxDetails: MAX_DETAILS,
    }),
};
