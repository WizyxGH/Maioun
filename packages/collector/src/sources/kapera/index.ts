/**
 * Source : Kapera Immobilier — voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-14 : aucune règle, sitemap déclaré. 7
 * locations au relevé, dont 5 à Nice (Antibes et Valbonne écartées au scoring).
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const KAPERA_DESCRIPTOR: SourceDescriptor = {
  id: 'kapera',
  name: 'Kapera Immobilier',
  domain: 'kapera-immobilier.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/location-appartement-nice/', '/biens/*'],
  notes:
    'WordPress + Elementor alimenté par Apimo. robots.txt vérifié le 2026-09-14 : ' +
    'aucune règle. Liste /location-appartement-nice/, fiches /biens/{slug}/ en ' +
    'intertitres « Libellé : valeur ».',
};

export const kaperaScraper: Scraper = {
  descriptor: KAPERA_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: KAPERA_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
