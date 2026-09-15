/**
 * Source : La Franco Suisse — voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : seuls /assets/, /temp/, /recupdata/,
 * /img/ et /components/ interdits. 4 locations à Nice au relevé (un 3 pièces
 * meublé, trois garages).
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const LA_FRANCO_SUISSE_DESCRIPTOR: SourceDescriptor = {
  id: 'la-franco-suisse',
  name: 'La Franco Suisse',
  domain: 'lafrancosuisse.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/fr/immobilier-nice/locations/', '/fr/location/*'],
  agencyContact: {
    phone: '04 93 80 47 81', // secret-scan-ignore
    address: { street: "19 rue de l'Hôtel des Postes", postalCode: '06000', city: 'Nice' },
  },
  notes:
    "Site On'App (ColdFusion), rendu serveur. robots.txt vérifié le 2026-09-15 : " +
    'seuls /assets/, /temp/, /recupdata/, /img/, /components/ interdits. Liste ' +
    '/fr/immobilier-nice/locations/ (une page), fiches …/reference-{id}/ : tableau ' +
    '« Détails » (prix, charges, surface), dépôt et honoraires dans la description.',
};

export const laFrancoSuisseScraper: Scraper = {
  descriptor: LA_FRANCO_SUISSE_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: LA_FRANCO_SUISSE_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
