/**
 * Fabrique de scrapers pour les agences sur plateforme Twimmo. Ajouter une
 * agence = une entrée `makeTwimmoScraper({...})`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_PATH, parseTwimmoDetail, parseTwimmoList } from './parser.js';

export interface TwimmoConfig {
  readonly id: string;
  readonly name: string;
  /** Origine du site (`https://www.mk-immo.fr`) ; liste et domaine s'en déduisent. */
  readonly siteUrl: string;
  readonly priority?: number;
  readonly maxDetails?: number;
  readonly notes?: string;
  /** Coordonnées publiques de l'agence (adresse de vitrine, ligne générale). */
  readonly agencyContact?: SourceDescriptor['agencyContact'];
}

export const twimmoListUrl = (config: TwimmoConfig): string =>
  new URL(LIST_PATH, config.siteUrl).href;

export function makeTwimmoDescriptor(config: TwimmoConfig): SourceDescriptor {
  const maxDetails = config.maxDetails ?? 8;
  return {
    id: config.id,
    name: config.name,
    domain: new URL(config.siteUrl).hostname.replace(/^www\./, ''),
    kind: 'localAgency',
    method: 'html',
    priority: config.priority ?? 2,
    schedule: scheduleFor('localAgency'),
    budget: budgetFor('localAgency', { maxPagesPerRun: 1 + maxDetails }),
    enabled: true,
    allowedPaths: [LIST_PATH, '/*.html'],
    ...(config.agencyContact !== undefined ? { agencyContact: config.agencyContact } : {}),
    notes:
      config.notes ??
      `Site Twimmo, rendu serveur. Liste ${LIST_PATH} (une page), fiches ` +
        '…-{réf}.html dont les montants sont des phrases engendrées (loyer CC, ' +
        'provision, honoraires, dépôt).',
  };
}

export function makeTwimmoScraper(config: TwimmoConfig): Scraper {
  const descriptor = makeTwimmoDescriptor(config);
  return {
    descriptor,
    run: (context) =>
      runListAndDetails(context, {
        sourceId: descriptor.id,
        listUrls: [twimmoListUrl(config)],
        parseList: (body, url) => parseTwimmoList(body, url, config.name),
        parseDetail: (html) => parseTwimmoDetail(html),
        maxDetails: config.maxDetails ?? 8,
      }),
  };
}
