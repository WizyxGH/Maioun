/**
 * Source : ParuVendu, locations d'appartements à Nice. Voir `parser.ts`.
 *
 * L'INVENTAIRE ENTIER À CHAQUE PASSAGE, sans arrêt anticipé : un cycle de vie
 * qui tranche à chaque fois — la leçon de LocService, où l'arrêt sur du
 * déjà-vu empêchait de jamais retirer une annonce partie.
 *
 * LA RECHERCHE S'ARRÊTE À CINQ PAGES, soit 150 annonces, quel que soit le
 * stock : 165 le 2026-09-14. Les quinze de trop changeaient à chaque tri et
 * passaient pour disparues alors qu'elles étaient en ligne. On relit donc aussi
 * la recherche par nombre de pièces, dont chaque tranche tient sous le plafond,
 * et l'on ne retire rien tant que le compte n'y est pas.
 *
 * Les pages inchangées (304) sont confirmées par la mémoire des pages.
 *
 * LES FICHES des annonces nouvelles sont lues ensuite, pour les charges et la
 * description entière que la carte n'a pas.
 */
import type {
  RawListing,
  Scraper,
  ScrapeContext,
  ScrapeResult,
  SourceDescriptor,
  StopReason,
} from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { enrichNewListings } from '../shared/enrich.js';
import { pageUrlFor, parseDetail, parseSearchPage } from './parser.js';

/** Pages lues au plus par recherche ; le site n'en sert pas plus de cinq. */
const MAX_PAGES = 6;

/** La recherche entière, puis ses tranches par pièces ; au-delà de 4, le site ne filtre plus. */
const ROOM_SEGMENTS: readonly (number | undefined)[] = [undefined, 1, 2, 3, 4];

/** Pages de toutes les recherches : 5 + 3 + 2 + 2 + 1 aujourd'hui. */
const MAX_LIST_PAGES = 20;

/** Fiches lues par passage : le stock de 150 se complète en quelques cycles. */
const MAX_DETAILS = 20;

export const PARUVENDU_DESCRIPTOR: SourceDescriptor = {
  id: 'paruvendu',
  name: 'ParuVendu',
  domain: 'paruvendu.fr',
  kind: 'portal',
  method: 'html',
  // Des particuliers, que presque aucune autre source n'apporte.
  priority: 2,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', {
    maxPagesPerRun: MAX_LIST_PAGES + MAX_DETAILS,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  // Le portail REPUBLIE des annonces d'agences — LocService, BEP, Citya… Deux
  // annonces de cette source qui partagent une photo sont donc le même bien.
  relaysListings: true,
  allowedPaths: [
    '/immobilier/recherche/location/appartement/nice/',
    '/immobilier/location/appartement/*',
  ],
  notes:
    'robots.txt vérifié le 2026-09-11 : ferme /immobilier/annonceimmofo/, ' +
    '/immobilier/annoncefo/ et les paramètres ?pagv=, ?tri=, ?d=, ?fulltext= ; ' +
    'la pagination ?p=N et le filtre ?nbpieces= restent ouverts. 165 annonces à Nice, dont 13 de ' +
    'particuliers ; les deux tiers viennent d’agences déjà collectées, que le ' +
    'dédoublonnage rapproche.',
};

export const paruvenduScraper: Scraper = {
  descriptor: PARUVENDU_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const confirmedRefs: string[] = [];
    const warnings: string[] = [];
    const counters = { requestCount: 0, pagesFetched: 0 };
    let stopReason: StopReason = 'completed';
    let pageInconnue = false;
    let totalCount: number | null = null;

    for (const rooms of ROOM_SEGMENTS) {
      const pass = await readSearch(context, rooms, counters);
      // Une tranche ne répète que des annonces déjà lues : on n'en garde qu'une.
      const already = new Set(listings.map((listing) => listing.sourceRef));
      listings.push(...pass.listings.filter((listing) => !already.has(listing.sourceRef)));
      confirmedRefs.push(...pass.confirmedRefs);
      warnings.push(...pass.warnings);
      pageInconnue ||= pass.pageInconnue;
      if (rooms === undefined) totalCount = pass.totalCount;
      if (pass.stopReason !== 'completed') {
        stopReason = pass.stopReason;
        break;
      }
    }

    // Un inventaire à trou ne doit rien retirer.
    if (pageInconnue && stopReason === 'completed') stopReason = 'notModified';
    const lus = new Set([...listings.map((listing) => listing.sourceRef), ...confirmedRefs]);
    if (stopReason === 'completed' && totalCount !== null && lus.size < totalCount) {
      context.log('list.incomplete', { lues: lus.size, annoncees: totalCount });
      stopReason = 'incomplete';
    }

    const enriched = await enrichNewListings(context, listings, {
      max: MAX_DETAILS,
      detailUrl: (listing) => listing.sourceUrl,
      parse: (html, listing) => parseDetail(html, listing.priceText),
    });
    counters.requestCount += enriched.requestCount;
    counters.pagesFetched += enriched.pagesFetched;
    warnings.push(...enriched.warnings);

    return {
      sourceId: PARUVENDU_DESCRIPTOR.id,
      listings: enriched.listings,
      confirmedRefs,
      requestCount: counters.requestCount,
      pagesFetched: counters.pagesFetched,
      stopReason,
      warnings,
    };
  },
};

interface SearchPass {
  readonly listings: readonly RawListing[];
  readonly confirmedRefs: readonly string[];
  readonly warnings: readonly string[];
  readonly totalCount: number | null;
  readonly pageInconnue: boolean;
  readonly stopReason: StopReason;
}

/** Lit une recherche jusqu'à sa dernière page. */
async function readSearch(
  context: ScrapeContext,
  rooms: number | undefined,
  counters: { requestCount: number; pagesFetched: number },
): Promise<SearchPass> {
  const listings: RawListing[] = [];
  const confirmedRefs: string[] = [];
  const warnings: string[] = [];
  let totalCount: number | null = null;
  let pageInconnue = false;
  let stopReason: StopReason = 'completed';

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    if (context.shouldStop()) {
      stopReason = 'maxPages';
      break;
    }
    const url = pageUrlFor(page, rooms);
    try {
      const response = await context.fetch(url);
      counters.requestCount += 1;

      if (response.notModified) {
        // Page inchangée : ses annonces aussi. On ne sait pas si elle a une
        // suivante — on continue, une page vide dira la fin.
        const refs = await context.pageRefs.get(url);
        if (refs === null) pageInconnue = true;
        else confirmedRefs.push(...refs);
        continue;
      }
      counters.pagesFetched += 1;

      const parsed = parseSearchPage(response.body, url);
      if (page === 1) totalCount = parsed.totalCount;
      if (parsed.listings.length === 0) {
        if (page === 1) warnings.push(...parsed.warnings);
        break;
      }
      listings.push(...parsed.listings);
      await context.pageRefs.set(
        url,
        parsed.listings.map((listing) => listing.sourceRef),
      );
      if (!parsed.hasNextPage) break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec de la page ${page} : ${message}`);
      context.log('list.failed', { url, error: message });
      stopReason = message.includes('429') ? 'rateLimited' : 'tooManyErrors';
      break;
    }
  }
  return { listings, confirmedRefs, warnings, totalCount, pageInconnue, stopReason };
}
