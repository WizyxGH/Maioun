/**
 * Source : Agence Dumas (agencedumas.fr) — Villefranche-sur-Mer, Beaulieu-sur-Mer
 * et port de Nice. WordPress à thème maison, voir `parser.ts`.
 *
 * Une requête de liste par passage (`/locations-annuelles/`, toutes les
 * locations à l'année), puis les fiches des annonces nouvelles. robots.txt
 * vérifié le 2026-09-15 : absent (404), rien d'interdit. Trois agences : pas de
 * coordonnées uniques, la fiche porte le téléphone de l'agence concernée.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { isEmptyList, LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const AGENCE_DUMAS_DESCRIPTOR: SourceDescriptor = {
  id: 'agence-dumas',
  name: 'Agence Dumas',
  domain: 'agencedumas.fr',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/locations-annuelles/', '/p/*'],
  notes:
    'WordPress, thème maison, rendu serveur. robots.txt absent (404) au ' +
    '2026-09-15. Liste /locations-annuelles/ (cartes a.proprety-item), fiches ' +
    '/p/{slug}/ : loyer, détails, DPE/GES en image, montants lus dans la ' +
    'description. Le saisonnier (location.agencedumas.fr) n’est pas lu.',
};

export const agenceDumasScraper: Scraper = {
  descriptor: AGENCE_DUMAS_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: AGENCE_DUMAS_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      isEmptyList,
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
