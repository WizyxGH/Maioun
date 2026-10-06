/**
 * Source : Repimmo — voir `parser.ts`.
 *
 * La liste de Nice se lit en entier à chaque passage (neuf pages de dix au
 * relevé du 2026-10-06, 89 locations), puis les fiches des annonces nouvelles.
 *
 * robots.txt lu le 2026-10-06 : les listes `/annonces-immobilieres-*` et les
 * fiches `/petite_annonces_immobiliere/` sont ouvertes. Restent fermés, et
 * jamais demandés : `/contact_produit.php`, `/contact_action.php` (le
 * téléphone d'un particulier, révélé à la demande), `/search_action.php`,
 * `/media_display.php`, `/site_agence.php`, `/annuaire_immobilier/`.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, nextPage, parseDetail, parseList } from './parser.js';

/** Pages de liste au plus : neuf au relevé, de quoi doubler. */
const MAX_LIST_PAGES = 18;
const MAX_DETAILS = 20;

export const REPIMMO_DESCRIPTOR: SourceDescriptor = {
  id: 'repimmo',
  name: 'Repimmo',
  domain: 'repimmo.com',
  kind: 'portal',
  publishesOwnListings: false,
  method: 'html',
  priority: 3,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', { maxPagesPerRun: MAX_LIST_PAGES + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/annonces-immobilieres-nice/*', '/petite_annonces_immobiliere/*'],
  notes:
    'Petites annonces gratuites, particuliers et agences. Origine des annonces de Rentola, ' +
    'qui n’en garde ni la rue, ni les charges, ni le DPE, ni l’annonceur. robots.txt lu le ' +
    '2026-10-06 : listes et fiches ouvertes ; contact et annuaire fermés, non demandés.',
};

export const repimmoScraper: Scraper = {
  descriptor: REPIMMO_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: REPIMMO_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      nextPage,
      maxListPages: MAX_LIST_PAGES,
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
