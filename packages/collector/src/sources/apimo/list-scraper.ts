/**
 * Fabrique de scrapers Apimo par la page `/fr/locations` : pour l'ANCIEN schéma
 * d'URL (`/fr/propriété/{id}`), que `makeApimoScraper` ne sait pas filtrer, ou
 * pour un sitemap qui garde les locations disparues. Seules les fiches
 * NOUVELLES sont visitées (§30, §32). Voir `location-links.ts`.
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
import { parseLocationLinks, type LocationLink } from './location-links.js';
import { isCommercialSlug, parseApimoDetail } from './parser.js';

/** Bandeau « Aucun produit ne correspond… » d'une liste réellement vide. */
const NO_RESULTS = /class="[^"]*\bno-results\b/;

export interface ApimoListConfig {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  /** Pages de liste des locations ; la première doit porter des fiches. */
  readonly listUrls: readonly string[];
  readonly notes?: string;
  readonly maxDetailsLive?: number;
  readonly maxDetailsBackfill?: number;
  /** Coordonnées publiques de l'agence (adresse de vitrine, ligne générale). */
  readonly agencyContact?: SourceDescriptor['agencyContact'];
}

export function makeApimoListDescriptor(config: ApimoListConfig): SourceDescriptor {
  const maxBackfill = config.maxDetailsBackfill ?? 20;
  return {
    id: config.id,
    name: config.name,
    domain: config.domain,
    kind: 'localAgency',
    method: 'html',
    priority: 2,
    schedule: scheduleFor('localAgency'),
    budget: budgetFor('localAgency', {
      maxPagesPerRun: config.listUrls.length + maxBackfill,
      maxListingsPerRun: maxBackfill,
    }),
    enabled: true,
    // La liste n'est pas toujours /fr/locations (/fr/louer ailleurs) : ses chemins
    // viennent des adresses configurées.
    allowedPaths: [
      ...new Set(config.listUrls.map((url) => `${new URL(url).pathname}*`)),
      '/fr/propri*',
    ],
    ...(config.agencyContact !== undefined ? { agencyContact: config.agencyContact } : {}),
    notes:
      config.notes ??
      'Apimo ANCIEN schéma (/fr/propriété/{id}, sitemap non filtrable). robots.txt ' +
        'permissif (seul /app_dev.php interdit). Locations listées par /fr/locations ' +
        '(liens SSR), fiches nouvelles visitées (JSON-LD Apimo). Communes voisines ' +
        'écartées au scoring.',
  };
}

export function makeApimoListScraper(config: ApimoListConfig): Scraper {
  const descriptor = makeApimoListDescriptor(config);
  const maxLive = config.maxDetailsLive ?? 8;
  const maxBackfill = config.maxDetailsBackfill ?? 20;

  return {
    descriptor,

    async run(context: ScrapeContext): Promise<ScrapeResult> {
      const listings: RawListing[] = [];
      const rentedRefs: string[] = [];
      const warnings: string[] = [];
      let requestCount = 0;
      let pagesFetched = 0;
      let stopReason: StopReason = 'completed';

      // --- 1. Listes des fiches de location ---------------------------------
      const links = new Map<string, LocationLink>();
      let unchanged = 0;
      let saysEmpty = false;
      for (const listUrl of config.listUrls) {
        try {
          const response = await context.fetch(listUrl);
          requestCount += 1;
          if (response.notModified) {
            unchanged += 1;
            continue;
          }
          pagesFetched += 1;
          saysEmpty ||= NO_RESULTS.test(response.body);
          for (const link of parseLocationLinks(response.body, listUrl)) {
            if (!links.has(link.reference)) links.set(link.reference, link);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Échec de la liste ${listUrl} : ${message}`);
          context.log('list.failed', { url: listUrl, error: message });
          if (message.includes('429')) {
            return {
              sourceId: config.id,
              listings,
              requestCount,
              pagesFetched,
              stopReason: 'rateLimited',
              warnings,
            };
          }
        }
      }
      if (unchanged === config.listUrls.length) {
        return {
          sourceId: config.id,
          listings: [],
          requestCount,
          pagesFetched,
          stopReason: 'notModified',
          warnings,
        };
      }
      // Une page suivante vide est normale ; toutes vides sans le message « aucun
      // bien » du gabarit, la structure a changé.
      if (links.size === 0 && pagesFetched > 0) {
        if (saysEmpty && warnings.length === 0) {
          return {
            sourceId: config.id,
            listings,
            requestCount,
            pagesFetched,
            stopReason: 'empty',
            warnings,
          };
        }
        warnings.push(`Aucune fiche trouvée sur la liste : ${config.listUrls[0] ?? ''}`);
      }

      // --- 2. Nouvelles fiches uniquement (§32) ------------------------------
      const all = [...links.values()];
      const confirmedRefs = all.filter((l) => context.isKnown(l.reference)).map((l) => l.reference);
      const candidates = all.filter(
        (l) => !context.isKnown(l.reference) && !isCommercialSlug(l.typeSlug),
      );
      const maxDetails = context.mode === 'backfill' ? maxBackfill : maxLive;

      context.log('list.parsed', {
        total: all.length,
        known: confirmedRefs.length,
        new: candidates.length,
        toFetch: Math.min(candidates.length, maxDetails),
      });

      // --- 3. Visite des fiches ----------------------------------------------
      for (const link of candidates.slice(0, maxDetails)) {
        if (context.shouldStop()) {
          stopReason = 'maxPages';
          break;
        }
        try {
          const response = await context.fetch(link.canonicalUrl);
          requestCount += 1;
          if (response.notModified) continue;
          pagesFetched += 1;

          // Ancien schéma, sans ville ni type : ils viennent du JSON-LD.
          const parsed = parseApimoDetail(
            response.body,
            { transaction: 'location', ...link },
            config.name,
          );
          warnings.push(...parsed.warnings);
          if (parsed.listing !== null) listings.push(parsed.listing);
          else if (parsed.rented === true) rentedRefs.push(link.reference);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Échec sur ${link.canonicalUrl} : ${message}`);
          context.log('page.failed', { url: link.canonicalUrl, error: message });
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

      return {
        sourceId: config.id,
        listings,
        confirmedRefs,
        rentedRefs,
        requestCount,
        pagesFetched,
        stopReason,
        warnings,
      };
    },
  };
}
