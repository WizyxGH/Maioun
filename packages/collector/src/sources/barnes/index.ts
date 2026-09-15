/**
 * Source : BARNES (barnes-international.com) — réseau international de
 * prestige ; locations longue durée des Alpes-Maritimes. Voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches nouvelles de la zone.
 * robots.txt vérifié le 2026-09-15 : seuls les modales, la recherche, la carte,
 * les archives et des gabarits sont interdits. Au relevé : 1 location longue
 * durée dans le département (Roquebrune-Cap-Martin, prix sur demande), 0 à
 * Nice — la page Nice affiche « Aucun résultat ».
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { detailUrl, isEmptyList, LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 6;

export const BARNES_DESCRIPTOR: SourceDescriptor = {
  id: 'barnes',
  name: 'BARNES',
  domain: 'barnes-international.com',
  kind: 'agencyNetwork',
  method: 'html',
  priority: 3,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('agencyNetwork', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/fr/location/france/alpes-maritimes.html', '/fr/location/france/*/ref-*.html'],
  notes:
    'Gabarit maison rendu serveur. robots.txt vérifié le 2026-09-15 (/*search* ' +
    'interdit, non utilisé). Liste /fr/location/france/alpes-maritimes.html ' +
    '(longue durée ; 24 cartes par page), fiches lues pour les communes de la ' +
    'zone seulement. Saisonnier sous /fr/location-saisonniere, non lu.',
};

export const barnesScraper: Scraper = {
  descriptor: BARNES_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: BARNES_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      isEmptyList,
      detailUrl,
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
