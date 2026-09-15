/**
 * Fabrique de scrapers pour le nouveau gabarit AdaptImmo : une entrée
 * `makeAdaptImmoV2Scraper({...})` par agence. Voir `v2-parser.ts`.
 *
 * Une requête de liste par passage, puis l'API de fiche des seules annonces
 * nouvelles (§30, §32) : la page HTML de la fiche n'a pas de données serveur.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { V2_DETAIL_API, parseV2Detail, parseV2List, v2DetailApiUrl } from './v2-parser.js';

export interface AdaptImmoV2Config {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  /** Numéro d'agence AdaptImmo (`NUMAGE`), requis par l'API des fiches. */
  readonly agencyNumber: string;
  /** Numéro de groupe (`NUMGROUP`) ; celui de l'agence par défaut. */
  readonly groupNumber?: string;
  /** Liste des locations, absolue (`/fr/liste-location?…`). */
  readonly listUrl: string;
  readonly priority?: number;
  /** Fiches lues au plus par passage. */
  readonly maxDetails?: number;
  /** Coordonnées publiques de l'agence (adresse de vitrine, ligne générale). */
  readonly agencyContact?: SourceDescriptor['agencyContact'];
}

export function makeAdaptImmoV2Descriptor(config: AdaptImmoV2Config): SourceDescriptor {
  const maxDetails = config.maxDetails ?? 8;
  return {
    id: config.id,
    name: config.name,
    domain: config.domain,
    kind: 'localAgency',
    method: 'html',
    priority: config.priority ?? 2,
    schedule: scheduleFor('localAgency'),
    budget: budgetFor('localAgency', { maxPagesPerRun: 1 + maxDetails }),
    enabled: true,
    allowedPaths: ['/fr/liste-location*', `${V2_DETAIL_API}*`],
    ...(config.agencyContact !== undefined ? { agencyContact: config.agencyContact } : {}),
    notes:
      'Nouveau gabarit AdaptImmo (/fr/liste-location, /fr/detail-bien-{cle}). ' +
      'Liste lue dans son JSON-LD ; la fiche HTML est rendue en JS, ses données ' +
      '(charges, dépôt, photos) viennent de l’API publique reach.adaptimmo.com, ' +
      'dont le robots.txt n’interdit rien.',
  };
}

export function makeAdaptImmoV2Scraper(config: AdaptImmoV2Config): Scraper {
  const descriptor = makeAdaptImmoV2Descriptor(config);
  return {
    descriptor,
    run: (context) =>
      runListAndDetails(context, {
        sourceId: config.id,
        listUrls: [config.listUrl],
        parseList: (body, url) => parseV2List(body, url, config.name),
        detailUrl: (listing) =>
          v2DetailApiUrl(listing.sourceRef, config.agencyNumber, config.groupNumber),
        parseDetail: (body) => parseV2Detail(body),
        maxDetails: config.maxDetails ?? 8,
      }),
  };
}
