/**
 * Fabrique de scrapers pour les agences sur plateforme Netty (§5, §47).
 *
 * Ajouter une agence = une entrée `makeNettyScraper({...})` : sitemap →
 * filtrage des communes cibles → visite des seules fiches nouvelles →
 * confirmation des connues sans requête (§30, §32).
 *
 * DEUX DIFFÉRENCES AVEC L'ADAPTATEUR APIMO, toutes deux dictées par la
 * plateforme :
 *   - le sitemap ne porte aucun `lastmod`, donc ni tri par fraîcheur ni rejet
 *     des fiches anciennes ; il est en revanche petit et purgé ;
 *   - `robots.txt` demande `Crawl-delay: 5`, au-dessus des 4 s du gabarit
 *     `localAgency` : le budget est ralenti d'autant. Une demande de délai se
 *     respecte telle qu'elle est écrite, on ne l'arrondit pas à la baisse.
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
import { isFreshMemory, REJECTED_DRAFT } from '../shared/enrich.js';
import type { RawDraft } from '../shared/raw-listing.js';
import { sitemapUrls } from '../shared/sitemap.js';
import {
  isCommercialUrl,
  matchesCity,
  parseDetailPage,
  parseSitemap,
  parseSitemapIndex,
  type ParsedDetail,
  type SitemapEntry,
} from './parser.js';

export interface NettyConfig {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  /** URL du sitemap (index ou urlset direct). */
  readonly sitemapUrl: string;
  /** Communes cibles, en slug d'URL (minuscules, tirets). */
  readonly citySlugs: readonly string[];
  readonly priority?: number;
  readonly maxDetailsLive?: number;
  readonly maxDetailsBackfill?: number;
  /** Coordonnées publiques de l'agence (adresse de vitrine, ligne générale). */
  readonly agencyContact?: SourceDescriptor['agencyContact'];
}

/** `Crawl-delay: 5`, tel que l'écrivent les `robots.txt` engendrés par Netty. */
const CRAWL_DELAY_MS = 5_000;

export function makeNettyDescriptor(config: NettyConfig): SourceDescriptor {
  const maxBackfill = config.maxDetailsBackfill ?? 20;
  return {
    id: config.id,
    name: config.name,
    domain: config.domain,
    ...(config.agencyContact !== undefined ? { agencyContact: config.agencyContact } : {}),
    kind: 'localAgency',
    method: 'sitemap',
    priority: config.priority ?? 2,
    schedule: scheduleFor('localAgency'),
    budget: budgetFor('localAgency', {
      delayBetweenRequestsMs: CRAWL_DELAY_MS,
      maxPagesPerRun: 2 + maxBackfill,
      maxListingsPerRun: maxBackfill,
    }),
    enabled: true,
    allowedPaths: ['/sitemap*.xml', '/location/*'],
    notes:
      `Plateforme Netty (adaptateur générique, §47). robots.txt n'interdit que ` +
      `/*.pdf et demande Crawl-delay: 5, respecté. Sitemap déclaré, sans lastmod ` +
      `mais purgé et de petite taille ; seules les fiches nouvelles des communes ` +
      `cibles sont visitées. Fiches riches : JSON-LD (prix, surface, pièces, ` +
      `commune, photos) et mentions légales portant charges, dépôt et DPE.`,
  };
}

/** Mémoire d'une fiche écartée : le motif n'est gardé que s'il tient à une règle. */
const rejectedDraft = (parsed: ParsedDetail): RawDraft =>
  parsed.excluded === undefined ? REJECTED_DRAFT : { extra: { excluded: parsed.excluded } };

const isExcluded = (draft: RawDraft | undefined): boolean =>
  draft?.extra?.['excluded'] !== undefined;

/**
 * Sitemap complet, rien rendu ni confirmé, et toutes les fiches visées écartées
 * par règle — local d'après l'adresse, saisonnier lu cette fois ou mémorisé
 * cette semaine : aucun logement à louer. Une fiche illisible, en échec ou non
 * lue laisse le doute.
 */
function allRuledOut(
  context: ScrapeContext,
  targeted: readonly SitemapEntry[],
  outcome: {
    readonly sitemapComplete: boolean;
    readonly listings: readonly RawListing[];
    readonly confirmedRefs: readonly string[];
    readonly rejected: readonly { sourceRef: string; draft: RawDraft }[];
  },
): boolean {
  if (!outcome.sitemapComplete || outcome.listings.length > 0 || outcome.confirmedRefs.length > 0) {
    return false;
  }
  const now = new Map(outcome.rejected.map((entry) => [entry.sourceRef, entry.draft]));
  const nowMs = Date.now();
  return targeted.every(({ url }) => {
    if (isCommercialUrl(url) || isExcluded(now.get(url.reference))) return true;
    const memory = context.detailMemory.get(url.reference);
    return isFreshMemory(memory, nowMs) && isExcluded(memory?.draft);
  });
}

export function makeNettyScraper(config: NettyConfig): Scraper {
  const descriptor = makeNettyDescriptor(config);
  const maxLive = config.maxDetailsLive ?? 8;
  const maxBackfill = config.maxDetailsBackfill ?? 20;

  return {
    descriptor,

    async run(context: ScrapeContext): Promise<ScrapeResult> {
      const listings: RawListing[] = [];
      const warnings: string[] = [];
      let requestCount = 0;
      let pagesFetched = 0;
      let stopReason: StopReason = 'completed';

      // --- 1. Sitemap : découvrir toutes les fiches de location ------------
      let entries: SitemapEntry[] = [];
      // Sitemap lu en entier et non vide : sans location visée, l'agence n'en a pas.
      let sitemapComplete = false;
      try {
        const index = await context.fetch(config.sitemapUrl);
        requestCount += 1;
        pagesFetched += 1;

        if (index.notModified) {
          context.log('sitemap.not_modified', { url: config.sitemapUrl });
          return {
            sourceId: config.id,
            listings: [],
            requestCount,
            pagesFetched,
            stopReason: 'notModified',
            warnings,
          };
        }

        const children = parseSitemapIndex(index.body).slice(0, 3);
        // Les deux sites observés servent l'urlset directement ; un index reste
        // possible, la plateforme le permet.
        const bodies = children.length > 0 ? [] : [index.body];
        for (const childUrl of children) {
          const child = await context.fetch(childUrl);
          requestCount += 1;
          pagesFetched += 1;
          if (!child.notModified) bodies.push(child.body);
        }
        entries = bodies.flatMap((body) => parseSitemap(body));
        sitemapComplete =
          bodies.length === Math.max(children.length, 1) &&
          bodies.some((body) => sitemapUrls(body).length > 0);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Échec du sitemap : ${message}`);
        context.log('sitemap.failed', { error: message });
        return {
          sourceId: config.id,
          listings: [],
          requestCount,
          pagesFetched,
          stopReason: message.includes('429') ? 'rateLimited' : 'tooManyErrors',
          warnings,
        };
      }

      // --- 2. Filtrer -----------------------------------------------------
      const targeted = entries.filter((entry) => matchesCity(entry.url, config.citySlugs));
      if (targeted.length === 0 && sitemapComplete) {
        return {
          sourceId: config.id,
          listings,
          requestCount,
          pagesFetched,
          stopReason: 'empty',
          warnings,
        };
      }
      const confirmedRefs = targeted
        .filter((entry) => context.isKnown(entry.url.reference))
        .map((entry) => entry.url.reference);
      // Une fiche écartée cette semaine (local commercial, saisonnier) ne se relit pas.
      const nowMs = Date.now();
      const candidates = targeted.filter(
        (entry) =>
          !context.isKnown(entry.url.reference) &&
          !isFreshMemory(context.detailMemory.get(entry.url.reference), nowMs),
      );
      const rejected: { sourceRef: string; draft: RawDraft }[] = [];

      const maxDetails = context.mode === 'backfill' ? maxBackfill : maxLive;

      context.log('sitemap.parsed', {
        total: entries.length,
        targeted: targeted.length,
        known: confirmedRefs.length,
        new: candidates.length,
        toFetch: Math.min(candidates.length, maxDetails),
      });

      // --- 3. Visiter uniquement les fiches nouvelles ---------------------
      for (const entry of candidates.slice(0, maxDetails)) {
        if (context.shouldStop()) {
          stopReason = 'maxPages';
          break;
        }
        try {
          const response = await context.fetch(entry.url.canonicalUrl);
          requestCount += 1;
          if (response.notModified) continue;
          pagesFetched += 1;

          const parsed = parseDetailPage(response.body, entry.url.canonicalUrl, config.name);
          warnings.push(...parsed.warnings);
          if (parsed.listing !== null) listings.push(parsed.listing);
          else rejected.push({ sourceRef: entry.url.reference, draft: rejectedDraft(parsed) });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Échec sur ${entry.url.canonicalUrl} : ${message}`);
          context.log('page.failed', { url: entry.url.canonicalUrl, error: message });
          if (message.includes('429')) {
            stopReason = 'rateLimited';
            break;
          }
          if (message.includes('refusé')) {
            stopReason = 'blocked';
            break;
          }
        }
      }

      const outcome = { sitemapComplete, listings, confirmedRefs, rejected };
      if (stopReason === 'completed' && allRuledOut(context, targeted, outcome)) {
        stopReason = 'empty';
      }

      if (rejected.length > 0) {
        try {
          await context.detailMemory.save(rejected);
        } catch (error) {
          // Sans mémoire, ces fiches seront relues : rien de plus grave.
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Mémoire des fiches non enregistrée (${rejected.length}) : ${message}`);
        }
      }

      return {
        sourceId: config.id,
        listings,
        confirmedRefs,
        requestCount,
        pagesFetched,
        stopReason,
        warnings,
      };
    },
  };
}
