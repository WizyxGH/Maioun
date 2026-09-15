/**
 * Source : Altarea Gestion Immobilière - Nice (altarea.flatbay.fr) — agence de
 * Nice du gestionnaire national (400 promenade des Anglais selon le registre
 * SIRENE ; la vitrine ne publie ni adresse ni téléphone). Vitrine Flatbay, voir
 * `parser.ts`.
 *
 * Une requête de liste par passage (filtre sur l'établissement de Nice), puis
 * les fiches des annonces nouvelles. robots.txt vérifié le 2026-09-15 : aucune
 * interdiction. 8 locations au relevé pour l'agence, dont 4 à Nice (3
 * appartements, 1 box) ; Mougins et le Var sont écartés au scoring.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const ALTAREA_NICE_DESCRIPTOR: SourceDescriptor = {
  id: 'altarea-nice',
  name: 'Altarea Gestion Immobilière - Nice',
  domain: 'altarea.flatbay.fr',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/fr/search', '/fr/property/show/*'],
  notes:
    'Vitrine Flatbay du gestionnaire, rendu serveur. robots.txt vérifié le ' +
    '2026-09-15 : aucune interdiction. Recherche filtrée etablissementId=8 ' +
    '(Nice) ; fiches /fr/property/show/{id} à JSON-LD RealEstateListing valide.',
};

export const altareaNiceScraper: Scraper = {
  descriptor: ALTAREA_NICE_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: ALTAREA_NICE_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
