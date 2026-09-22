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

const SEARCH_URL = 'https://lamaisonette.fr/recherche';
const MAX_DETAILS = 20;

export const MAISONETTE_DESCRIPTOR: SourceDescriptor = {
  id: 'maisonette',
  name: 'Maisonette',
  domain: 'lamaisonette.fr',
  kind: 'portal',
  method: 'html',
  priority: 3,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', {
    maxPagesPerRun: 1 + MAX_DETAILS,
    maxListingsPerRun: 100,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  allowedPaths: ['/recherche', '/logements/*'],
  notes:
    'robots.txt vérifié le 2026-09-22 : recherche publique autorisée, API et ' +
    'espaces personnels exclus. La source propose surtout des baux mobilité ' +
    'meublés de 1 à 10 mois ; le texte et le type de bail sont conservés pour ' +
    'que les critères existants puissent les écarter.',
};

export const maisonetteScraper: Scraper = {
  descriptor: MAISONETTE_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const confirmedRefs: string[] = [];
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    try {
      const response = await context.fetch(SEARCH_URL);
      requestCount += 1;
      if (!response.notModified) {
        pagesFetched += 1;
        const parsed = parseSearchPage(response.body, SEARCH_URL);
        warnings.push(...parsed.warnings);
        listings.push(...parsed.listings);
        confirmedRefs.push(...parsed.listings.map((listing) => listing.sourceRef));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec sur ${SEARCH_URL} : ${message}`);
      stopReason = stopReasonFromError(message);
    }

    let enriched = 0;
    for (const listing of listings) {
      if (enriched >= MAX_DETAILS || context.shouldStop() || context.isKnown(listing.sourceRef)) {
        continue;
      }
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
          if (index >= 0) listings[index] = detail;
          enriched += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Détail échoué ${listing.sourceUrl} : ${message}`);
      }
    }

    return {
      sourceId: MAISONETTE_DESCRIPTOR.id,
      listings,
      confirmedRefs,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
