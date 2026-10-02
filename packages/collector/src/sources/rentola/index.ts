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

/**
 * Fiches CONNUES relues par exécution, les moins pauvres d'images d'abord.
 *
 * SANS CE RELU, UNE ANNONCE GARDE SA PHOTO UNIQUE À JAMAIS. La liste ne sert
 * qu'une vignette, et la fiche — qui en donne jusqu'à vingt — n'était demandée
 * que pour les annonces INCONNUES. Relevé du 2026-09-29 sur 314 annonces
 * Rentola en base : 287 n'avaient qu'une image, contre 4 à 21 pour les rares
 * passées par la fiche. La source ne publie donc presque rien de ses photos,
 * alors qu'elle les a toutes.
 *
 * On se passe de délai : le tri est fait sur le nombre d'images, donc une
 * annonce qui en a vingt n'est jamais relue, et le stock s'amincit de six à
 * chaque passage jusqu'à être complet.
 */
const MAX_RECHECKS = 6;

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
    maxPagesPerRun: MAX_PAGES + MAX_DETAILS + MAX_RECHECKS,
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

/** Ce qu'une relecture a appris, et ce qu'elle a coûté. */
interface RecheckReport {
  readonly listings: ReadonlyMap<string, RawListing>;
  readonly requestCount: number;
  readonly pagesFetched: number;
}

/**
 * Relit les fiches CONNUES dont les photos n'ont jamais été lues.
 *
 * La liste ne porte qu'une vignette ; la fiche en porte vingt. On priorise
 * celles qui n'ont qu'une image — ce sont celles que la liste a produites et
 * qu'aucun enrichissement n'a reprises.
 */
async function recheckThinListings(
  context: ScrapeContext,
  listings: readonly RawListing[],
): Promise<RecheckReport> {
  const enhanced = new Map<string, RawListing>();
  let requestCount = 0;
  let pagesFetched = 0;

  const thin = listings.filter((listing) => (listing.imageUrls?.length ?? 0) <= 1);
  for (const listing of thin) {
    if (enhanced.size >= MAX_RECHECKS || context.shouldStop()) break;
    try {
      const response = await context.fetch(listing.sourceUrl);
      requestCount += 1;
      if (response.notModified) continue;
      pagesFetched += 1;
      const detail = parseDetailPage(response.body, listing.sourceUrl);
      if (detail === null || (detail.imageUrls?.length ?? 0) === 0) continue;
      enhanced.set(listing.sourceRef, {
        ...listing,
        ...detail,
        extra: { ...listing.extra, ...detail.extra },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.log('recheck.failed', { url: listing.sourceUrl, error: message });
    }
  }

  return { listings: enhanced, requestCount, pagesFetched };
}

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

    // Les fiches CONNUES qui n'ont qu'une vignette : sans ce relu, elles en
    // gardent une à vie. Le stock entier est ainsi rattrapé en quelques
    // dizaines de passages, au rythme du budget de pages.
    const relecture = await recheckThinListings(context, listings);
    for (const [reference, enriched] of relecture.listings) {
      const at = listings.findIndex((candidate) => candidate.sourceRef === reference);
      if (at >= 0) listings[at] = enriched;
    }
    requestCount += relecture.requestCount;
    pagesFetched += relecture.pagesFetched;
    if (relecture.listings.size > 0) {
      context.log('recheck.enriched', {
        listings: relecture.listings.size,
        remaining: listings.filter((one) => (one.imageUrls?.length ?? 0) <= 1).length,
      });
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
