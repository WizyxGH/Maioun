/**
 * Source : Arthurimmo.com — réseau national d'experts immobiliers.
 *
 * Implantation à Nice (Arthurimmo Nice Transactions Nord, Est, Agence des Beaux Arts, etc.).
 * Scraping HTML de la recherche location Nice et fiches de détail complètes
 * (charges, dépôt de garantie, honoraires, DPE/GES SVG, caractéristiques, contact).
 */

import type {
  RawListing,
  Scraper,
  ScrapeContext,
  ScrapeResult,
  SourceDescriptor,
} from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { stopReasonFromError } from '../shared/stop-reason.js';
import { ARTHURIMMO_SEARCH_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 20;

export const ARTHURIMMO_DESCRIPTOR: SourceDescriptor = {
  id: 'arthurimmo',
  name: 'Arthurimmo.com',
  domain: 'arthurimmo.com',
  kind: 'portal',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', {
    maxPagesPerRun: 25,
    maxListingsPerRun: 50,
    delayBetweenRequestsMs: 1_500,
  }),
  enabled: true,
  allowedPaths: ['/recherche,basic.htm*', '/annonces/location/*'],
  notes:
    'Réseau d’agences Arthurimmo.com. Recherche location Nice + 10 km. ' +
    'Extraction de la recherche et enrichissement par les fiches de détail complètes ' +
    '(loyer décomposé, charges, dépôt, DPE/GES, équipement, agence et contact).',
};

export const arthurimmoScraper: Scraper = {
  descriptor: ARTHURIMMO_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const warnings: string[] = [];
    const confirmedRefs: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    try {
      const response = await context.fetch(ARTHURIMMO_SEARCH_URL, {
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      requestCount += 1;

      if (response.notModified) {
        return {
          sourceId: ARTHURIMMO_DESCRIPTOR.id,
          listings: [],
          confirmedRefs: [],
          requestCount,
          pagesFetched,
          stopReason: 'notModified',
          warnings,
        };
      }

      pagesFetched += 1;
      const parsed = parseList(response.body);
      warnings.push(...parsed.warnings);
      for (const listing of parsed.listings) {
        confirmedRefs.push(listing.sourceRef);
        listings.push(listing);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec recherche Arthurimmo : ${message}`);
      return {
        sourceId: ARTHURIMMO_DESCRIPTOR.id,
        listings: [],
        confirmedRefs: [],
        requestCount,
        pagesFetched,
        stopReason: stopReasonFromError(message),
        warnings,
      };
    }

    // Enrichissement par la page de détail pour chaque annonce
    let enriched = 0;
    for (const listing of listings) {
      if (enriched >= MAX_DETAILS || context.shouldStop()) break;
      if (context.isKnown(listing.sourceRef)) continue;
      try {
        const response = await context.fetch(listing.sourceUrl);
        requestCount += 1;
        if (response.notModified) continue;
        pagesFetched += 1;
        const detail = parseDetail(response.body, listing.sourceUrl);
        if (detail !== null) {
          const index = listings.findIndex(
            (candidate) => candidate.sourceRef === listing.sourceRef,
          );
          if (index >= 0) {
            listings[index] = {
              ...listings[index],
              ...detail,
              extra: { ...listings[index]?.extra, ...detail.extra },
            };
          }
          enriched += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Détail échoué ${listing.sourceUrl} : ${message}`);
      }
    }

    return {
      sourceId: ARTHURIMMO_DESCRIPTOR.id,
      listings,
      confirmedRefs,
      requestCount,
      pagesFetched,
      stopReason: listings.length === 0 ? 'empty' : 'completed',
      warnings,
    };
  },
};
