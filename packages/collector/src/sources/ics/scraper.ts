/**
 * Fabrique de scrapers pour les cabinets sur plateforme ICS (§5, §47).
 * Ajouter un cabinet = une entrée `makeIcsScraper({...})`.
 *
 * Une seule requête par exécution : la page de liste porte l'intégralité des
 * annonces dans un JSON embarqué, et la pagination est purement visuelle
 * (JavaScript sur le tableau déjà chargé). Aucune fiche n'est visitée (§30).
 */

import type {
  Scraper,
  ScrapeContext,
  ScrapeResult,
  SourceDescriptor,
  StopReason,
} from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { parseListPage, saysNoResults } from './parser.js';
import { stopReasonFromError } from '../shared/stop-reason.js';

export interface IcsConfig {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  /** Page de résultats filtrée sur la location. */
  readonly listUrl: string;
  readonly priority?: number;
  /** Coordonnées publiques de l'agence (adresse de vitrine, ligne générale). */
  readonly agencyContact?: SourceDescriptor['agencyContact'];
}

export function makeIcsDescriptor(config: IcsConfig): SourceDescriptor {
  return {
    id: config.id,
    name: config.name,
    domain: config.domain,
    kind: 'localAgency',
    method: 'html',
    priority: config.priority ?? 2,
    schedule: scheduleFor('localAgency'),
    budget: budgetFor('localAgency', { maxPagesPerRun: 1, maxListingsPerRun: 40 }),
    enabled: true,
    allowedPaths: ['/location*'],
    ...(config.agencyContact !== undefined ? { agencyContact: config.agencyContact } : {}),
    notes:
      'Plateforme ICS (ics.fr), adaptateur générique (§47). La page de liste ' +
      'sérialise ses annonces dans un `var properties = [...]` : une requête ' +
      'suffit, la pagination est purement visuelle et aucune fiche n’est ' +
      'visitée. Ce JSON n’est pas analysable par JSON.parse (HTML échappé de ' +
      'façon invalide) — voir `parser.ts`.',
  };
}

export function makeIcsScraper(config: IcsConfig): Scraper {
  const descriptor = makeIcsDescriptor(config);

  return {
    descriptor,

    async run(context: ScrapeContext): Promise<ScrapeResult> {
      const warnings: string[] = [];
      let stopReason: StopReason = 'completed';

      try {
        const response = await context.fetch(config.listUrl);
        if (response.notModified) {
          return {
            sourceId: config.id,
            listings: [],
            requestCount: 1,
            pagesFetched: 0,
            stopReason: 'notModified',
            warnings,
          };
        }

        const listings = parseListPage(response.body, config.listUrl, config.name);
        if (listings.length === 0) {
          if (saysNoResults(response.body)) stopReason = 'empty';
          else warnings.push(`Aucune annonce sur la liste : ${config.listUrl}`);
        }
        context.log('list.parsed', { listings: listings.length });

        return {
          sourceId: config.id,
          listings,
          requestCount: 1,
          pagesFetched: 1,
          stopReason,
          warnings,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Échec de la liste : ${message}`);
        context.log('list.failed', { url: config.listUrl, error: message });
        stopReason = stopReasonFromError(message);
        return {
          sourceId: config.id,
          listings: [],
          requestCount: 1,
          pagesFetched: 0,
          stopReason,
          warnings,
        };
      }
    },
  };
}
