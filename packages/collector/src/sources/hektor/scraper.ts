/**
 * Fabrique de scrapers pour les agences sur plateforme La Boîte Immo/Hektor
 * Ajouter une agence = une entrée `makeHektorScraper({...})`.
 *
 * Méthode : pages de LISTE (server-rendered) → liens de fiches → visite des
 * seules fiches nouvelles ; les connues sont confirmées sans requête. Le
 * sitemap n'est pas utilisé : sur plusieurs sites de la plateforme il
 * ne référence pas les fiches.
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
import { withdrawnRefsFrom, type GoneDetail } from '../shared/withdrawn.js';
import { parseDetailPage, parseListPage, type ParsedHektorUrl } from './parser.js';

export interface HektorConfig {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  /** Icone de l agence quand elle n est pas a /favicon.ico (voir SourceDescriptor). */
  readonly logo?: string;
  /**
   * Points d'entrée des listes de location, en adresses absolues.
   *
   * La PREMIÈRE page suffit : la pagination du site est suivie à partir de là.
   * Plusieurs entrées ne servent qu'aux sites qui séparent leurs listes
   * (par commune, par type de bien).
   */
  readonly listUrls: readonly string[];
  readonly priority?: number;
  readonly maxDetailsLive?: number;
  readonly maxDetailsBackfill?: number;
  /** Coordonnées publiques de l'agence (adresse de vitrine, ligne générale). */
  readonly agencyContact?: SourceDescriptor['agencyContact'];
}

/**
 * Pages de liste lues par adresse déclarée.
 *
 * La plus grosse agence de la plateforme en occupe six (giletta, 53 locations
 * le 2026-09-17). Douze laissent de la marge sans rien coûter : la lecture
 * s'arrête dès qu'une page n'apporte plus de fiche.
 */
const MAX_LIST_PAGES = 12;

export function makeHektorDescriptor(config: HektorConfig): SourceDescriptor {
  const maxBackfill = config.maxDetailsBackfill ?? 20;
  return {
    id: config.id,
    name: config.name,
    domain: config.domain,
    ...(config.logo !== undefined ? { logo: config.logo } : {}),
    ...(config.agencyContact !== undefined ? { agencyContact: config.agencyContact } : {}),
    kind: 'localAgency',
    method: 'html',
    priority: config.priority ?? 2,
    schedule: scheduleFor('localAgency'),
    budget: budgetFor('localAgency', {
      // La pagination est suivie : le budget compte les pages qu'elle peut
      // ouvrir, et non les seules adresses déclarées.
      maxPagesPerRun: config.listUrls.length * MAX_LIST_PAGES + maxBackfill,
      maxListingsPerRun: maxBackfill,
    }),
    enabled: true,
    allowedPaths: ['/location*', '/a-louer*', '/*.html'],
    notes:
      'Plateforme La Boîte Immo/Hektor (adaptateur générique). robots.txt ' +
      'permissif (interdits : /stats, /phpmv2, /fonctions, /templates, /admin). ' +
      'Listes SSR → fiches nouvelles uniquement. DPE lu sur le seul gabarit à ' +
      'pastilles ; ailleurs image sous /admin, interdit par robots — laissé inconnu. ' +
      'La pagination des listes est suivie : une seule adresse à déclarer par liste.',
  };
}

export function makeHektorScraper(config: HektorConfig): Scraper {
  const descriptor = makeHektorDescriptor(config);
  const maxLive = config.maxDetailsLive ?? 8;
  const maxBackfill = config.maxDetailsBackfill ?? 20;

  return {
    descriptor,

    async run(context: ScrapeContext): Promise<ScrapeResult> {
      const listings: RawListing[] = [];
      const warnings: string[] = [];
      const parties: GoneDetail[] = [];
      let detailsRequested = 0;
      let requestCount = 0;
      let pagesFetched = 0;
      let stopReason: StopReason = 'completed';

      // --- 1. Listes : découvrir les fiches ---------------------------------
      const lecture = await readLists(context, config.listUrls);
      requestCount += lecture.requestCount;
      pagesFetched += lecture.pagesFetched;
      warnings.push(...lecture.warnings);
      const discovered = lecture.discovered;
      if (lecture.rateLimited) {
        return {
          sourceId: config.id,
          listings,
          requestCount,
          pagesFetched,
          stopReason: 'rateLimited',
          warnings,
        };
      }

      // L'agence affiche n'avoir aucune location : rien à visiter, rien de cassé.
      if (discovered.size === 0 && lecture.saysEmpty && !lecture.failed) {
        return {
          sourceId: config.id,
          listings,
          requestCount,
          pagesFetched,
          stopReason: 'empty',
          warnings,
        };
      }

      // --- 2. Nouvelles fiches d'abord, connues confirmées sans requête -----
      const all = [...discovered.values()];
      const confirmedRefs = all
        .filter((url) => context.isKnown(url.reference))
        .map((url) => url.reference);
      const candidates = all.filter((url) => !context.isKnown(url.reference));
      const maxDetails = context.mode === 'backfill' ? maxBackfill : maxLive;

      context.log('list.parsed', {
        discovered: all.length,
        known: confirmedRefs.length,
        new: candidates.length,
        toFetch: Math.min(candidates.length, maxDetails),
      });

      // --- 3. Visite des fiches nouvelles -----------------------------------
      for (const url of candidates.slice(0, maxDetails)) {
        if (context.shouldStop()) {
          stopReason = 'maxPages';
          break;
        }
        try {
          const response = await context.fetch(url.canonicalUrl);
          requestCount += 1;
          detailsRequested += 1;
          if (response.notModified) continue;
          pagesFetched += 1;

          const parsed = parseDetailPage(response.body, url.canonicalUrl, config.name);
          warnings.push(...parsed.warnings);
          // Fiche retirée : le site sert l'accueil à sa place, en 200. La liste
          // peut encore la montrer — c'est la fiche qui fait foi.
          if (parsed.withdrawn === true) {
            parties.push({ sourceRef: url.reference, url: url.canonicalUrl, status: 200 });
          }
          if (parsed.listing !== null) listings.push(parsed.listing);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Échec sur ${url.canonicalUrl} : ${message}`);
          context.log('page.failed', { url: url.canonicalUrl, error: message });
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

      // Fiches dont le canonique dit qu'elles ne sont plus servies, sous les
      // garde-fous de `shared/withdrawn.ts` : une salve dénoncerait un gabarit
      // changé, pas un inventaire loué d'un coup.
      const withdrawnRefs = withdrawnRefsFrom(
        context,
        { gone: parties, detailsRequested },
        stopReason,
      );
      const eteintes = new Set(withdrawnRefs);

      return {
        sourceId: config.id,
        listings: listings.filter((listing) => !eteintes.has(listing.sourceRef)),
        // Une référence retirée n'est pas confirmée par la liste qui l'affiche
        // encore : sinon on la réécrirait vivante juste avant de l'éteindre.
        confirmedRefs: confirmedRefs.filter((reference) => !eteintes.has(reference)),
        withdrawnRefs,
        requestCount,
        pagesFetched,
        stopReason,
        warnings,
      };
    },
  };
}

/** Ce qu'une lecture de listes rapporte, pagination comprise. */
interface ListPass {
  readonly discovered: Map<string, ParsedHektorUrl>;
  readonly warnings: readonly string[];
  readonly requestCount: number;
  readonly pagesFetched: number;
  /** Une page a dit n'avoir aucun bien : liste vide, pas gabarit cassé. */
  readonly saysEmpty: boolean;
  /** Une page au moins n'a pas pu être lue : l'inventaire est incertain. */
  readonly failed: boolean;
  readonly rateLimited: boolean;
}

/**
 * Parcourt chaque liste déclarée, PUIS SA PAGINATION.
 *
 * LA PAGE 2 N'ÉTAIT JAMAIS LUE, et le descripteur ne pouvait pas le savoir : le
 * stock d'une agence grossit sans prévenir. Relevé du 2026-09-17 —
 * giletta-properties.com publiait 53 locations sur six pages pour trois
 * adresses déclarées, et vingt des vingt-trois annonces des pages 4 à 6
 * n'étaient dans aucune source du projet.
 */
async function readLists(context: ScrapeContext, listUrls: readonly string[]): Promise<ListPass> {
  const discovered = new Map<string, ParsedHektorUrl>();
  const visited = new Set<string>();
  const warnings: string[] = [];
  let requestCount = 0;
  let pagesFetched = 0;
  let saysEmpty = false;
  let failed = false;

  for (const listUrl of listUrls) {
    let pageUrl: string | null = listUrl;
    for (let page = 0; pageUrl !== null && page < MAX_LIST_PAGES; page += 1) {
      if (visited.has(pageUrl)) break;
      visited.add(pageUrl);
      const url: string = pageUrl;
      pageUrl = null;
      let response;
      try {
        response = await context.fetch(url);
        requestCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Échec de la liste ${url} : ${message}`);
        context.log('list.failed', { url, error: message });
        failed = true;
        if (message.includes('429')) {
          return {
            discovered,
            warnings,
            requestCount,
            pagesFetched,
            saysEmpty,
            failed,
            rateLimited: true,
          };
        }
        continue;
      }

      if (response.notModified) {
        context.log('list.not_modified', { url });
        break;
      }
      pagesFetched += 1;
      const parsed = parseListPage(response.body, url);
      warnings.push(...parsed.warnings);
      saysEmpty ||= parsed.empty;
      for (const fiche of parsed.urls) {
        if (!discovered.has(fiche.reference)) discovered.set(fiche.reference, fiche);
      }
      // Une page sans fiche ferme la pagination. Au-delà de sa dernière page la
      // plateforme sert une liste vide en offrant toujours un lien « suivant » :
      // s'y fier ferait tourner la lecture en rond.
      if (parsed.urls.length > 0) pageUrl = parsed.nextPageUrl;
    }
  }

  return {
    discovered,
    warnings,
    requestCount,
    pagesFetched,
    saysEmpty,
    failed,
    rateLimited: false,
  };
}
