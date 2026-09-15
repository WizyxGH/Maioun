/**
 * Source : John Taylor (john-taylor.fr) — réseau international de prestige,
 * service location longue durée sur la Côte d'Azur. Voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches nouvelles de la zone.
 * robots.txt vérifié le 2026-09-15 : `Allow: *`, sitemaps déclarés. 14
 * locations à l'année sur la Côte d'Azur au relevé, dont Cagnes-sur-Mer
 * (8 000 €/mois) et Vence ; le reste (Mougins, Valbonne, Grasse) est hors zone.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { detailUrl, LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 6;

export const JOHN_TAYLOR_DESCRIPTOR: SourceDescriptor = {
  id: 'john-taylor',
  name: 'John Taylor',
  domain: 'john-taylor.fr',
  kind: 'agencyNetwork',
  method: 'html',
  priority: 3,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('agencyNetwork', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/france/location/*'],
  notes:
    'Gabarit maison rendu serveur. robots.txt vérifié le 2026-09-15 : Allow *. ' +
    'Liste /france/location/cote-d-azur/ (locations à l’année, cartes schema.org ' +
    'Offer, loyer « / Mois »), fiches lues pour la zone seulement (code postal). ' +
    'Saisonnier sous /location-saisonniere/, non lu.',
};

export const johnTaylorScraper: Scraper = {
  descriptor: JOHN_TAYLOR_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: JOHN_TAYLOR_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      detailUrl,
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
