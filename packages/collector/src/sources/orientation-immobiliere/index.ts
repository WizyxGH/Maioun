/**
 * Source : L'Orientation Immobilière (orimnice.fr) — 76 avenue de Brancolar,
 * 06100 Nice. Site ICS au gabarit « neocs », voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : aucune règle. 4 locations au relevé :
 * 2 studios et un parking à Nice, un 2 pièces au Cannet (écarté au scoring).
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const ORIENTATION_IMMOBILIERE_DESCRIPTOR: SourceDescriptor = {
  id: 'orientation-immobiliere',
  name: 'L’Orientation Immobilière',
  domain: 'orimnice.fr',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/resultats', '/location-*'],
  agencyContact: {
    phone: '04 93 84 14 53', // secret-scan-ignore
    address: { street: '76 avenue de Brancolar', postalCode: '06100', city: 'Nice' },
  },
  notes:
    'Site ICS au gabarit « neocs », rendu serveur, hors adaptateur ics (pas de ' +
    'JSON embarqué). robots.txt vérifié le 2026-09-15 : aucune règle. Liste ' +
    'resultats?transac=location, fiches location-{type}-{pièces}-{ville}-{réf}.',
};

export const orientationImmobiliereScraper: Scraper = {
  descriptor: ORIENTATION_IMMOBILIERE_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: ORIENTATION_IMMOBILIERE_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
