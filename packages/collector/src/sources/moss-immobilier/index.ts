/**
 * Source : Moss Immobilier — voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : aucune interdiction. 7 cartes sur la liste
 * au relevé, toutes à Nice, dont 3 fiches déjà retirées (404) et un local
 * commercial ; restent 3 appartements.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const MOSS_IMMOBILIER_DESCRIPTOR: SourceDescriptor = {
  id: 'moss-immobilier',
  name: 'Moss Immobilier',
  domain: 'mossimmobilier.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/location/', '/properties/*'],
  agencyContact: {
    phone: '04 22 13 16 92', // secret-scan-ignore
    address: { street: '2 rue Beethoven', postalCode: '06000', city: 'Nice' },
  },
  notes:
    'WordPress + extension Apimo, rendu serveur. robots.txt vérifié le ' +
    '2026-09-15 : aucune interdiction. Liste /location/ (une page, référence ' +
    'Apimo sur chaque carte), fiches /properties/{slug}/ ; charges, caution et ' +
    'honoraires lus dans la description.',
};

export const mossImmobilierScraper: Scraper = {
  descriptor: MOSS_IMMOBILIER_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: MOSS_IMMOBILIER_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
