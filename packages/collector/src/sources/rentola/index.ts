import type {
  RawListing,
  Scraper,
  ScrapeContext,
  ScrapeResult,
  SourceDescriptor,
  StopReason,
} from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { stopReasonFromError } from '../shared/stop-reason.js';
import { parseDetailPage, parseSearchPage } from './parser.js';

const ORIGIN = 'https://rentola.fr';
const SEARCH_URL = `${ORIGIN}/location/nice`;
const MAX_PAGES = 15;
const MAX_DETAILS = 24;

export const RENTOLA_DESCRIPTOR: SourceDescriptor = {
  id: 'rentola',
  name: 'Rentola',
  domain: 'rentola.fr',
  kind: 'portal',
  publishesOwnListings: false,
  method: 'html',
  priority: 3,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', {
    maxPagesPerRun: MAX_PAGES + MAX_DETAILS,
    maxListingsPerRun: 350,
    delayBetweenRequestsMs: 2_500,
  }),
  enabled: true,
  hostsWantedAds: false,
  allowedPaths: ['/location/nice*', '/listings/*'],
  paidContact: true,
  notes:
    'Agrégateur et portail de location. Expose les annonces via JSON-LD ItemList. ' +
    'Agrège des mandats issus de Repimmo et de propriétaires directs.',
};

export const rentolaScraper: Scraper = {
  descriptor: RENTOLA_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const warnings: string[] = [];
    const confirmedRefs: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (context.shouldStop()) break;
      const url = page === 1 ? SEARCH_URL : `${SEARCH_URL}?page=${page}`;
      try {
        const response = await context.fetch(url);
        requestCount += 1;
        if (response.notModified) continue;
        pagesFetched += 1;
        const parsed = parseSearchPage(response.body, url);
        warnings.push(...parsed.warnings);
        for (const listing of parsed.listings) {
          confirmedRefs.push(listing.sourceRef);
          listings.push(listing);
        }
        if (!parsed.hasNextPage && page > 1) break;
        if (page === MAX_PAGES && parsed.listings.length > 0) {
          warnings.push(
            `Plafond de ${MAX_PAGES} pages atteint, la dernière en portait encore ` +
              `${parsed.listings.length} : le catalogue est peut-être tronqué.`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Échec sur ${url} : ${message}`);
        stopReason = stopReasonFromError(message);
        break;
      }
    }

    let enriched = 0;
    for (const listing of listings) {
      if (enriched >= MAX_DETAILS || context.shouldStop()) break;
      if (context.isKnown(listing.sourceRef)) continue;
      try {
        const response = await context.fetch(listing.sourceUrl);
        requestCount += 1;
        if (response.notModified) continue;
        pagesFetched += 1;
        const detail = parseDetailPage(response.body, listing.sourceUrl);
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
      sourceId: RENTOLA_DESCRIPTOR.id,
      listings,
      confirmedRefs,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
