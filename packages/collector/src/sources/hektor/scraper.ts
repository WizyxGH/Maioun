/**
 * Fabrique de scrapers pour les agences sur plateforme La Boîte Immo/Hektor
 * Ajouter une agence = une entrée `makeHektorScraper({...})`.
 *
 * Méthode : pages de LISTE (server-rendered) → liens de fiches → visite des
 * fiches nouvelles, puis d'UNE fiche déjà connue par passage. Le sitemap n'est
 * pas utilisé : sur plusieurs sites de la plateforme il ne référence pas les
 * fiches.
 */

import type {
  DetailMemoryEntry,
  RawListing,
  Scraper,
  ScrapeContext,
  ScrapeResult,
  SourceDescriptor,
  StopReason,
} from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { isFreshMemory } from '../shared/enrich.js';
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

/**
 * Fiches déjà CONNUES relues par passage, une fois les nouvelles servies.
 *
 * UNE FICHE CONNUE N'ÉTAIT JAMAIS RELUE : chaque progrès du parseur ne
 * profitait qu'aux annonces découvertes après lui, et le stock gardait
 * indéfiniment ce qu'une version plus pauvre avait su lire. Relevé du
 * 2026-09-18 sur les cinquante-trois agences de la plateforme : 160 des 228
 * annonces en ligne sont sans e-mail, 149 sans téléphone, alors que leur fiche
 * les porte.
 *
 * UNE SEULE PAR PASSAGE SUFFIT. Chaque agence est lue une dizaine de fois par
 * jour et n'a qu'un peu plus de quatre annonces : l'inventaire entier est
 * rattrapé en une demi-journée. Passé le rattrapage, la fraîcheur d'une
 * semaine (`isFreshMemory`) ramène la dépense à une trentaine de requêtes par
 * jour pour la plateforme entière, soit moins d'un demi pour cent des ~8 100
 * requêtes quotidiennes du projet.
 */
const RELECTURES_PAR_PASSAGE = 1;

/** En rattrapage, le plafond des relectures suit celui des nouveautés. */
const RELECTURES_PAR_PASSAGE_BACKFILL = 5;

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
      'Listes SSR → fiches nouvelles, plus une fiche connue relue par passage. ' +
      'DPE lu sur le seul gabarit à ' +
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
      const connues = all.filter((url) => context.isKnown(url.reference));
      const confirmedRefs = connues.map((url) => url.reference);
      const candidates = all.filter((url) => !context.isKnown(url.reference));
      const maxDetails = context.mode === 'backfill' ? maxBackfill : maxLive;

      context.log('list.parsed', {
        discovered: all.length,
        known: confirmedRefs.length,
        new: candidates.length,
        toFetch: Math.min(candidates.length, maxDetails),
      });

      // --- 3. Visite des fiches nouvelles -----------------------------------
      const nouvelles = await visiterFiches(
        context,
        candidates.slice(0, maxDetails),
        config.name,
        true,
      );

      // --- 4. Relecture d'une fiche connue ----------------------------------
      // LA NOUVEAUTÉ PASSE AVANT : on ne relit que si toutes les nouvelles ont
      // été servies et que rien n'a interrompu le passage.
      const relisibles =
        nouvelles.stopReason === null && candidates.length <= maxDetails
          ? aRelire(
              context,
              connues,
              context.mode === 'backfill'
                ? RELECTURES_PAR_PASSAGE_BACKFILL
                : RELECTURES_PAR_PASSAGE,
            )
          : [];
      // SANS CACHE CONDITIONNEL : la page n'a pas changé, c'est le parseur qui
      // a changé — un 304 ne rendrait rien à relire.
      const relues = await visiterFiches(context, relisibles, config.name, false);
      if (relisibles.length > 0) {
        context.log('detail.refreshed', { asked: relisibles.length, read: relues.lues.length });
      }

      const passages = [nouvelles, relues];
      listings.push(...passages.flatMap((passage) => passage.listings));
      warnings.push(...passages.flatMap((passage) => passage.warnings));
      parties.push(...passages.flatMap((passage) => passage.gone));
      requestCount += passages.reduce((total, passage) => total + passage.requestCount, 0);
      pagesFetched += passages.reduce((total, passage) => total + passage.pagesFetched, 0);
      detailsRequested += passages.reduce((total, passage) => total + passage.detailsRequested, 0);
      stopReason = nouvelles.stopReason ?? relues.stopReason ?? 'completed';

      await noterLectures(
        context,
        passages.flatMap((passage) => passage.lues),
      );

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

/** Ce qu'une série de visites de fiches rapporte. */
interface DetailPass {
  readonly listings: readonly RawListing[];
  readonly warnings: readonly string[];
  readonly gone: readonly GoneDetail[];
  /** Références dont la page a réellement été lue pendant ce passage. */
  readonly lues: readonly string[];
  readonly requestCount: number;
  readonly pagesFetched: number;
  readonly detailsRequested: number;
  /** Ce qui a interrompu la série, ou `null` si elle est allée au bout. */
  readonly stopReason: StopReason | null;
}

/**
 * Visite une série de fiches. Le même code sert aux nouveautés et aux
 * relectures : deux boucles jumelles auraient divergé au premier correctif.
 *
 * `conditionnel` : `false` désactive ETag et If-Modified-Since, pour une page
 * qu'on relit sans qu'elle ait changé.
 */
async function visiterFiches(
  context: ScrapeContext,
  urls: readonly ParsedHektorUrl[],
  agencyName: string,
  conditionnel: boolean,
): Promise<DetailPass> {
  const listings: RawListing[] = [];
  const warnings: string[] = [];
  const gone: GoneDetail[] = [];
  const lues: string[] = [];
  let requestCount = 0;
  let pagesFetched = 0;
  let detailsRequested = 0;
  let stopReason: StopReason | null = null;

  for (const url of urls) {
    if (context.shouldStop()) {
      stopReason = 'maxPages';
      break;
    }
    try {
      const response = await context.fetch(
        url.canonicalUrl,
        conditionnel ? {} : { conditional: false },
      );
      requestCount += 1;
      detailsRequested += 1;
      if (response.notModified) continue;
      pagesFetched += 1;
      lues.push(url.reference);

      const parsed = parseDetailPage(response.body, url.canonicalUrl, agencyName);
      warnings.push(...parsed.warnings);
      // Fiche retirée : le site sert l'accueil à sa place, en 200. La liste
      // peut encore la montrer — c'est la fiche qui fait foi.
      if (parsed.withdrawn === true) {
        gone.push({ sourceRef: url.reference, url: url.canonicalUrl, status: 200 });
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

  return {
    listings,
    warnings,
    gone,
    lues,
    requestCount,
    pagesFetched,
    detailsRequested,
    stopReason,
  };
}

/**
 * Les fiches connues à relire : jamais lue d'abord, puis la plus anciennement
 * lue. Celles lues dans la semaine sont laissées de côté.
 *
 * L'ORDRE VIENT DE LA MÉMOIRE DES FICHES, qui existait déjà pour d'autres
 * sources et porte la date de lecture : pas de second circuit à tenir.
 * Choisir plutôt la fiche la plus PAUVRE — sans téléphone ni e-mail —
 * demanderait au cœur d'exposer ce que la base contient déjà de chaque
 * annonce ; la date suffit à ce que tout le stock y passe.
 */
function aRelire(
  context: ScrapeContext,
  connues: readonly ParsedHektorUrl[],
  max: number,
): readonly ParsedHektorUrl[] {
  if (max <= 0) return [];
  const nowMs = Date.now();
  return connues
    .map((url) => ({ url, memoire: context.detailMemory.get(url.reference) }))
    .filter((une) => !isFreshMemory(une.memoire, nowMs))
    .sort((a, b) => luLe(a.memoire) - luLe(b.memoire))
    .slice(0, max)
    .map((une) => une.url);
}

/** Date de dernière lecture, en millisecondes. `0` : jamais lue. */
function luLe(memoire: DetailMemoryEntry | null): number {
  if (memoire === null) return 0;
  const date = Date.parse(memoire.fetchedAt);
  return Number.isFinite(date) ? date : 0;
}

/**
 * Note la date de lecture des fiches visitées.
 *
 * Le brouillon reste vide : ici la fiche EST l'annonce, elle part entière dans
 * le résultat, et seule la date sert — c'est elle qui ordonne les relectures
 * suivantes. L'échec n'est jamais bloquant : les fiches seront relues.
 */
async function noterLectures(context: ScrapeContext, refs: readonly string[]): Promise<void> {
  if (refs.length === 0) return;
  try {
    await context.detailMemory.save(refs.map((sourceRef) => ({ sourceRef, draft: {} })));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.log('detail.memory_failed', { count: refs.length, error: message });
  }
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
