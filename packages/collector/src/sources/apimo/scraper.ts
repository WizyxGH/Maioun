/**
 * Fabrique de scrapers pour les agences sur plateforme Apimo/Cello (§5, §47).
 *
 * Ajouter une agence = une entrée `makeApimoScraper({...})`, sans dupliquer la
 * logique de collecte : sitemap → filtrage des communes cibles → visite des
 * fiches nouvelles, puis d'UNE fiche déjà connue par passage.
 *
 * LE SITEMAP NE PROUVE PAS QU'UNE ANNONCE EXISTE ENCORE. Ces sites ne le
 * purgent pas : la fiche Oréa retirée le 2026-09-18, qui redirige vers
 * `/fr/not-found`, y figurait encore, et la confirmation sans requête la
 * gardait « en ligne » chez nous — lien mort compris. Relire les fiches
 * connues est donc aussi ce qui les éteint.
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
import { sitemapUrls } from '../shared/sitemap.js';
import { parseLocationLinks } from './location-links.js';
import { withdrawnRefsFrom, type GoneDetail } from '../shared/withdrawn.js';
import {
  isCommercialSlug,
  parseDetailPage,
  parseSitemap,
  parseSitemapIndex,
  type SitemapEntry,
} from './parser.js';

export interface ApimoConfig {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  /** URL du sitemap (index ou urlset direct). */
  readonly sitemapUrl: string;
  /** Communes cibles, en slug d'URL (minuscules, tirets). */
  readonly citySlugs: readonly string[];
  /**
   * Pages de liste des locations, LUES EN PLUS du sitemap.
   *
   * À renseigner quand le sitemap s'est montré incomplet : il oublie parfois
   * ce qui vient d'arriver. L'union des deux vues est alors la seule lecture
   * honnête — voir le commentaire au point 1.
   */
  readonly listUrls?: readonly string[];
  readonly priority?: number;
  readonly maxDetailsLive?: number;
  readonly maxDetailsBackfill?: number;
  /**
   * Âge maximum d'une entrée de sitemap, en jours. Au-delà, on ne visite pas :
   * certains sites Apimo ne purgent jamais leur sitemap et y laissent des
   * annonces supprimées depuis plus d'un an (personalimmo : 23 entrées de
   * mars 2025 encore listées en août 2026, toutes en 404/301). Les visiter
   * gaspille le budget de pages au détriment des annonces vivantes.
   * Une entrée SANS `lastmod` n'est jamais écartée (§17). Défaut : 365 jours.
   */
  readonly maxEntryAgeDays?: number;
  /**
   * L'opérateur, quand cette agence publie AUSSI ailleurs (`SourceDescriptor.
   * operator`). BEP Logement double son site public d'un bulletin abonnés.
   */
  readonly operator?: string;
  /** Coordonnées publiques de l'agence (adresse de vitrine, ligne générale). */
  readonly agencyContact?: SourceDescriptor['agencyContact'];
}

export function makeApimoDescriptor(config: ApimoConfig): SourceDescriptor {
  const maxBackfill = config.maxDetailsBackfill ?? 20;
  return {
    id: config.id,
    name: config.name,
    domain: config.domain,
    kind: 'localAgency',
    method: 'sitemap',
    priority: config.priority ?? 2,
    schedule: scheduleFor('localAgency'),
    budget: budgetFor('localAgency', {
      // Une page de plus par page de liste déclarée : sans cela, le plafond
      // couperait le passage avant les fiches.
      maxPagesPerRun: 2 + (config.listUrls?.length ?? 0) + maxBackfill,
      maxListingsPerRun: maxBackfill,
    }),
    enabled: true,
    ...(config.operator !== undefined ? { operator: config.operator } : {}),
    ...(config.agencyContact !== undefined ? { agencyContact: config.agencyContact } : {}),
    allowedPaths: ['/sitemap*.xml', '/fr/propriete/location*'],
    notes:
      `Plateforme Apimo/Cello (adaptateur générique, §47). robots.txt permissif ` +
      `(seul /app_dev.php interdit), sitemap déclaré. Méthode sitemap : la liste ` +
      `HTML est en lazy-load JS, le sitemap donne toutes les fiches + lastmod ; ` +
      `les nouvelles des communes cibles sont visitées, plus une fiche connue ` +
      `relue par passage — le sitemap gardant les fiches retirées.`,
  };
}

/**
 * Fiches déjà CONNUES relues par passage, une fois les nouvelles servies.
 *
 * UNE FICHE CONNUE N'ÉTAIT JAMAIS RELUE : le sitemap la déclarait vivante et
 * rien n'allait vérifier. Une annonce retirée gardait donc sa place et son lien
 * mort jusqu'à quitter le sitemap — ce que ces sites ne font pas.
 *
 * UNE SEULE PAR PASSAGE SUFFIT. Les soixante agences de la plateforme sont lues
 * une quinzaine de fois par jour et portent une quinzaine d'annonces chacune :
 * l'inventaire entier y passe en une journée, la plus grosse (Oréa, 111
 * annonces) en six. Passé ce rattrapage, la fraîcheur d'une semaine
 * (`isFreshMemory`) ramène la dépense à environ 120 requêtes par jour pour la
 * plateforme entière, soit 1,5 % des ~8 100 requêtes quotidiennes du projet.
 */
const RELECTURES_PAR_PASSAGE = 1;

/** En rattrapage, le plafond des relectures suit celui des nouveautés. */
const RELECTURES_PAR_PASSAGE_BACKFILL = 5;

/**
 * Les fiches vues sur les pages de liste, ajoutées à celles du sitemap.
 *
 * Extrait de `run`, qui dépassait la complexité tolérée : la boucle a sa
 * propre raison d'être, et elle se relit mieux seule.
 */
async function ajouterLesPagesDeListe(
  context: ScrapeContext,
  config: ApimoConfig,
  entries: SitemapEntry[],
  warnings: string[],
  compter: (n: { requests: number; pages: number }) => void,
): Promise<SitemapEntry[]> {
  for (const listUrl of config.listUrls ?? []) {
    try {
      const page = await context.fetch(listUrl);
      compter({ requests: 1, pages: 0 });
      if (page.notModified) continue;
      compter({ requests: 0, pages: 1 });
      const connues = new Set(entries.map((one) => one.url.reference));
      for (const link of parseLocationLinks(page.body, listUrl)) {
        if (connues.has(link.reference)) continue;
        entries.push({
          url: {
            transaction: 'location',
            typeSlug: link.typeSlug,
            citySlug: link.citySlug,
            reference: link.reference,
            canonicalUrl: link.canonicalUrl,
          },
          lastmod: null,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec de la page de liste ${listUrl} : ${message}`);
      context.log('list.failed', { url: listUrl, error: message });
    }
  }
  return entries;
}

export function makeApimoScraper(config: ApimoConfig): Scraper {
  const descriptor = makeApimoDescriptor(config);
  const targetCities = new Set(config.citySlugs);
  const maxLive = config.maxDetailsLive ?? 8;
  const maxBackfill = config.maxDetailsBackfill ?? 20;
  const maxEntryAgeDays = config.maxEntryAgeDays ?? 365;

  return {
    descriptor,

    async run(context: ScrapeContext): Promise<ScrapeResult> {
      const listings: RawListing[] = [];
      const rentedRefs: string[] = [];
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
        // Certains sites servent l'urlset directement (pas d'index).
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

      /**
       * LA PAGE DE LISTE EN PLUS DU SITEMAP, quand la source en déclare une.
       *
       * UN SITEMAP OUBLIE CE QUI VIENT D'ARRIVER. Relevé du 2026-09-23 chez
       * Étude Lotte : la référence 7229516 figure sur sa page de locations et
       * pas à son sitemap. Elle ne nous est parvenue que par Bien'ici et par
       * une alerte e-mail — plus tard, et amputée de ce que le portail coupe —
       * alors que nous lisons ce site tous les jours.
       *
       * ON AJOUTE, ON NE REMPLACE PAS, et c'est la leçon de la même journée :
       * la page d'Étude Lotte n'affiche que deux annonces quand ses vingt-deux
       * fiches répondent toutes 200. Lire la page SEULE aurait fait perdre
       * vingt annonces bien vivantes. Chacune des deux vues est incomplète,
       * dans l'autre sens : leur union est la seule lecture honnête.
       *
       * SANS `lastmod`, donc jamais écartée par l'âge : une entrée vue sur la
       * page est en ligne aujourd'hui, par construction.
       */
      entries = await ajouterLesPagesDeListe(context, config, entries, warnings, (n) => {
        requestCount += n.requests;
        pagesFetched += n.pages;
      });

      // --- 2. Filtrer et prioriser ----------------------------------------
      // Les entrées trop anciennes sont écartées AVANT tout : un sitemap non
      // purgé y garde des annonces supprimées, qui consommeraient le budget de
      // pages pour rien. Sans `lastmod`, on ne juge pas (§17).
      const staleBefore = Date.now() - maxEntryAgeDays * 86_400_000;
      const fresh = entries.filter((entry) => {
        if (entry.lastmod === undefined || entry.lastmod === null) return true;
        const stamp = Date.parse(entry.lastmod);
        return !Number.isFinite(stamp) || stamp >= staleBefore;
      });
      const skippedStale = entries.length - fresh.length;
      if (skippedStale > 0) {
        context.log('sitemap.stale_skipped', { skipped: skippedStale, maxEntryAgeDays });
      }

      const targeted = fresh.filter(
        (entry) => targetCities.has(entry.url.citySlug) && !isCommercialSlug(entry.url.typeSlug),
      );
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
      const connues = targeted.filter((entry) => context.isKnown(entry.url.reference));
      const candidates = targeted
        .filter((entry) => !context.isKnown(entry.url.reference))
        .sort((a, b) => (b.lastmod ?? '').localeCompare(a.lastmod ?? ''));

      const maxDetails = context.mode === 'backfill' ? maxBackfill : maxLive;

      context.log('sitemap.parsed', {
        total: entries.length,
        targeted: targeted.length,
        known: connues.length,
        new: candidates.length,
        toFetch: Math.min(candidates.length, maxDetails),
      });

      // --- 3. Visiter les fiches nouvelles --------------------------------
      const nouvelles = await visiterFiches(
        context,
        candidates.slice(0, maxDetails),
        config.name,
        true,
      );

      // --- 4. Relire une fiche connue -------------------------------------
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
      // SANS CACHE CONDITIONNEL : une fiche retirée peut très bien répondre
      // « non modifiée », et on n'aurait rien relu ni rien appris.
      const relues = await visiterFiches(context, relisibles, config.name, false);
      if (relisibles.length > 0) {
        context.log('detail.refreshed', { asked: relisibles.length, read: relues.lues.length });
      }

      const passages = [nouvelles, relues];
      listings.push(...passages.flatMap((passage) => passage.listings));
      warnings.push(...passages.flatMap((passage) => passage.warnings));
      rentedRefs.push(...passages.flatMap((passage) => passage.rented));
      requestCount += passages.reduce((total, passage) => total + passage.requestCount, 0);
      pagesFetched += passages.reduce((total, passage) => total + passage.pagesFetched, 0);
      stopReason = nouvelles.stopReason ?? relues.stopReason ?? 'completed';

      await noterLectures(
        context,
        passages.flatMap((passage) => passage.lues),
      );

      // Fiches dont la page dit qu'elle n'est plus servie, sous les garde-fous
      // de `shared/withdrawn.ts` : une salve dénoncerait un gabarit changé, pas
      // un inventaire loué d'un coup.
      const withdrawnRefs = withdrawnRefsFrom(
        context,
        {
          gone: passages.flatMap((passage) => passage.gone),
          detailsRequested: passages.reduce(
            (total, passage) => total + passage.detailsRequested,
            0,
          ),
        },
        stopReason,
      );

      // Une fiche éteinte n'est pas confirmée en ligne dans le même passage :
      // le cœur la réécrirait active juste avant de l'éteindre.
      const parties = new Set(withdrawnRefs);
      const confirmedRefs = connues
        .map((entry) => entry.url.reference)
        .filter((reference) => !parties.has(reference));

      return {
        sourceId: config.id,
        listings,
        confirmedRefs,
        rentedRefs,
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
  /** Fiches que le site déclare déjà louées/vendues. */
  readonly rented: readonly string[];
  /** Fiches dont la page n'est plus servie. */
  readonly gone: readonly GoneDetail[];
  /** Références dont la page a réellement été lue pendant ce passage. */
  readonly lues: readonly string[];
  readonly requestCount: number;
  readonly pagesFetched: number;
  readonly detailsRequested: number;
  /** Ce qui a interrompu la série, ou `null` si elle est allée au bout. */
  readonly stopReason: StopReason | null;
}

/** Codes qui disent la page définitivement absente : introuvable, supprimée. */
const PAGE_DISPARUE: ReadonlySet<number> = new Set([404, 410]);

/**
 * Visite une série de fiches. Le même code sert aux nouveautés et aux
 * relectures : deux boucles jumelles auraient divergé au premier correctif.
 *
 * `conditionnel` : `false` désactive ETag et If-Modified-Since, pour une fiche
 * qu'on relit sans qu'elle ait changé.
 */
async function visiterFiches(
  context: ScrapeContext,
  entries: readonly SitemapEntry[],
  agencyName: string,
  conditionnel: boolean,
): Promise<DetailPass> {
  const listings: RawListing[] = [];
  const warnings: string[] = [];
  const rented: string[] = [];
  const gone: GoneDetail[] = [];
  const lues: string[] = [];
  let requestCount = 0;
  let pagesFetched = 0;
  let detailsRequested = 0;
  let stopReason: StopReason | null = null;

  for (const entry of entries) {
    if (context.shouldStop()) {
      stopReason = 'maxPages';
      break;
    }
    const url = entry.url.canonicalUrl;
    try {
      const response = await context.fetch(url, conditionnel ? {} : { conditional: false });
      requestCount += 1;
      detailsRequested += 1;
      if (response.notModified) continue;
      pagesFetched += 1;
      lues.push(entry.url.reference);

      // Page absente : le client HTTP SUIT les redirections, et le saut vers la
      // page « introuvable » arrive donc ici en 404, pas en 301.
      if (PAGE_DISPARUE.has(response.status)) {
        gone.push({ sourceRef: entry.url.reference, url, status: response.status });
        continue;
      }

      const parsed = parseDetailPage(response.body, url, agencyName);
      warnings.push(...parsed.warnings);
      // Fiche retirée servie en 200 : le site rend l'accueil ou sa recherche.
      // Le sitemap peut encore la montrer — c'est la fiche qui fait foi.
      if (parsed.withdrawn === true) {
        gone.push({ sourceRef: entry.url.reference, url, status: response.status });
      }
      if (parsed.listing !== null) listings.push(parsed.listing);
      else if (parsed.rented === true) rented.push(entry.url.reference);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec sur ${url} : ${message}`);
      context.log('page.failed', { url, error: message });
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
    rented,
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
 * sources et porte la date de lecture : pas de second circuit à tenir. Le
 * `lastmod` du sitemap dirait quand l'agence a touché l'annonce, jamais quand
 * elle l'a retirée — et c'est le retrait qu'on cherche.
 */
function aRelire(
  context: ScrapeContext,
  connues: readonly SitemapEntry[],
  max: number,
): readonly SitemapEntry[] {
  if (max <= 0) return [];
  const nowMs = Date.now();
  return connues
    .map((entry) => ({ entry, memoire: context.detailMemory.get(entry.url.reference) }))
    .filter((une) => !isFreshMemory(une.memoire, nowMs))
    .sort((a, b) => luLe(a.memoire) - luLe(b.memoire))
    .slice(0, max)
    .map((une) => une.entry);
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
