/**
 * Source : Concept Patrimoine — voir `parser.ts`.
 *
 * Une requête par passage : la page des locations porte loyer, surface,
 * pièces et commune. Les fiches des annonces nouvelles ajoutent description,
 * charges et honoraires. robots.txt vérifié le 2026-09-14 : aucune règle,
 * sitemap déclaré. 9 locations au relevé (Nice ×6, Saint-Laurent-du-Var ×2,
 * Cagnes-sur-Mer), dont 3 logements.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 6;

export const CONCEPT_PATRIMOINE_DESCRIPTOR: SourceDescriptor = {
  id: 'concept-patrimoine',
  name: 'Concept Patrimoine',
  domain: 'conceptpatrimoine.fr',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/locations/', '/proprietes/*'],
  notes:
    'WordPress, annonces importées de Netty. robots.txt vérifié le 2026-09-14 : ' +
    'aucune règle. Cartes article.netty-item complètes sur /locations/ ; fiches ' +
    '/proprietes/{slug}/ pour description, charges et honoraires.',
};

export const conceptPatrimoineScraper: Scraper = {
  descriptor: CONCEPT_PATRIMOINE_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: CONCEPT_PATRIMOINE_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
