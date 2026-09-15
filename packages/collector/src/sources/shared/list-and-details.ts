/**
 * Collecte « liste puis fiches » des petites agences à parseur dédié.
 *
 * La liste (page de résultats ou sitemap) ne donne souvent qu'une adresse de
 * fiche et quelques mots ; loyer, surface et description sont sur la fiche. On
 * lit donc la liste à chaque passage, puis les fiches par `enrichNewListings` :
 * nouvelles d'abord, mémoire réappliquée aux connues (§30, §32).
 *
 * Une annonce sans loyer n'est pas rendue — fiche pas encore lue, ou page qui
 * n'est pas une location au mois — mais une référence connue reste CONFIRMÉE,
 * pour ne pas passer à tort pour retirée.
 */

import type { RawListing, ScrapeContext, ScrapeResult } from '@maioun/shared';
import { enrichNewListings } from './enrich.js';
import type { RawDraft } from './raw-listing.js';

export interface ListAndDetailsOptions {
  readonly sourceId: string;
  readonly listUrls: readonly string[];
  /** Annonces esquissées depuis une page de liste. */
  readonly parseList: (body: string, url: string) => readonly RawListing[];
  /**
   * Adresse des données de la fiche, quand ce n'est pas la page de l'annonce
   * (API d'une fiche rendue en JavaScript). Défaut : `sourceUrl`.
   */
  readonly detailUrl?: (listing: RawListing) => string | null;
  /** Ce que la fiche apprend ; `null` si elle n'apprend rien. */
  readonly parseDetail: (html: string, listing: RawListing) => RawDraft | null;
  /** Fiches lues au plus par passage. */
  readonly maxDetails: number;
}

export async function runListAndDetails(
  context: ScrapeContext,
  options: ListAndDetailsOptions,
): Promise<ScrapeResult> {
  const { sourceId } = options;
  const warnings: string[] = [];
  let requestCount = 0;
  let pagesFetched = 0;
  const stubs = new Map<string, RawListing>();
  let unchanged = 0;

  for (const url of options.listUrls) {
    try {
      const response = await context.fetch(url);
      requestCount += 1;
      if (response.notModified) {
        unchanged += 1;
        continue;
      }
      pagesFetched += 1;
      for (const stub of options.parseList(response.body, url)) {
        if (!stubs.has(stub.sourceRef)) stubs.set(stub.sourceRef, stub);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec de la liste ${url} : ${message}`);
      context.log('list.failed', { url, error: message });
      if (message.includes('429') || message.includes('refusé')) {
        const stopReason = message.includes('429') ? 'rateLimited' : 'blocked';
        return { sourceId, listings: [], requestCount, pagesFetched, stopReason, warnings };
      }
    }
  }

  if (unchanged === options.listUrls.length) {
    return {
      sourceId,
      listings: [],
      requestCount,
      pagesFetched,
      stopReason: 'notModified',
      warnings,
    };
  }
  if (stubs.size === 0) {
    warnings.push(`Aucune annonce sur la liste : ${options.listUrls[0] ?? ''}`);
    const stopReason = pagesFetched === 0 ? 'tooManyErrors' : 'completed';
    return { sourceId, listings: [], requestCount, pagesFetched, stopReason, warnings };
  }

  const all = [...stubs.values()];
  const enriched = await enrichNewListings(context, all, {
    max: options.maxDetails,
    detailUrl: options.detailUrl ?? ((listing) => listing.sourceUrl),
    parse: options.parseDetail,
  });
  requestCount += enriched.requestCount;
  pagesFetched += enriched.pagesFetched;
  warnings.push(...enriched.warnings);

  const listings = enriched.listings.filter((listing) => listing.priceText !== undefined);
  const rendered = new Set(listings.map((listing) => listing.sourceRef));
  const confirmedRefs = all
    .map((stub) => stub.sourceRef)
    .filter((ref) => !rendered.has(ref) && context.isKnown(ref));

  context.log('list.parsed', {
    found: all.length,
    rendered: listings.length,
    details: enriched.pagesFetched,
  });

  return {
    sourceId,
    listings,
    confirmedRefs,
    requestCount,
    pagesFetched,
    stopReason: 'completed',
    warnings,
  };
}
