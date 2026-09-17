/**
 * Pipeline de collecte (§29, §78).
 *
 *   COLLECTER → NORMALISER → DÉDOUBLONNER → SCORER → PERSISTER
 *
 * Deux garanties structurent ce fichier :
 *
 *   1. ISOLATION DES PANNES (§69, §76). Chaque source tourne dans son propre
 *      `try`. Une source cassée produit un avertissement et passe en `degraded`
 *      ou `blocked` ; les autres continuent et le run se termine normalement.
 *
 *   2. ÉCONOMIE (§6, §30). Le budget de chaque source est appliqué par le
 *      client HTTP ; le scheduler limite le nombre de sources par run ; la
 *      persistance compare avant d'écrire.
 */

import { randomUUID } from 'node:crypto';
import type {
  NormalizedListing,
  RawListing,
  ScoredListing,
  ScrapeContext,
  ScrapeResult,
  Scraper,
  SourceHealth,
  SourceRuntimeState,
  StopReason,
} from '@maioun/shared';
import type { Clock } from './core/clock.js';
import type { Logger } from './core/logger.js';
import { BlockedError, createHttpClient, RateLimitedError } from './core/http-client.js';
import type { SourceRegistry } from './core/registry.js';
import { planRun, vanishingSources } from './scheduler/scheduler.js';
import { awaitedSources } from './sources/email-alerts/agency-refresh.js';
import { EMAIL_ALERTS_DESCRIPTOR } from './sources/email-alerts/index.js';
import { normalizeAll } from './normalization/normalize.js';
import { dedupe } from './deduplication/dedupe.js';
import { mergeGroup } from './deduplication/merge.js';
import { scoreListing, scoreMatch } from './scoring/index.js';
import { createGeocoder, geocodeCacheKey } from './core/geocode.js';
import { createDpeLookup, dpeCacheKey, type DpeRecord } from './core/dpe.js';
import { createTransitRouter } from './core/transit.js';
import type { Coordinates } from './core/geo.js';
import type { AggregatedListing } from '@maioun/shared';
import type { Repository, UpsertReport } from './db/repository.js';
import type { PublicConfig, ReferencePoint, TransitConfig } from './config.js';
import { withStoredCriteria } from './config.js';
import { resolveReferencePoints } from './core/reference-points.js';
import { mapLimited, memoizeStore, runGrouped } from './core/concurrency.js';
import { createRobotsGate, type RobotsGate } from './core/robots.js';
import {
  decryptSecret,
  type SourceCredentials,
  CURRENT_USER,
  REFERENCE_POINTS_SETTING,
  SEARCH_CRITERIA_SETTING,
} from '@maioun/shared';

/** Lectures de cache menées de front : des allers-retours vers la base, pas vers un site. */
const CACHE_READS_AT_ONCE = 16;

/**
 * Sources collectées de front. Chacune garde son propre rythme de politesse ;
 * deux sources d'un même site restent en file (voir `runGrouped`). Chaque site
 * ayant son hôte, doubler ce nombre ne charge aucun site davantage.
 */
const SOURCES_AT_ONCE = 12;

/**
 * Au-delà, plus aucune source ne DÉMARRE : celles qui restent sont dues au
 * passage suivant. Huit minutes laissent le dédoublonnage, le scoring et les
 * alertes finir bien avant le passage d'après.
 */
const SOURCE_PHASE_BUDGET_MS = 8 * 60_000;

/**
 * Profondeur sur laquelle on juge de la vitesse de disparition d'une source.
 *
 * Assez long pour qu'une petite agence accumule les quelques retraits qui
 * rendent la part crédible, assez court pour qu'un site qui a changé de rythme
 * ne traîne pas sa réputation d'il y a un mois.
 */
export const VANISH_WINDOW_DAYS = 14;

/**
 * Plafond d'appels réseau de géocodage par run (les adresses en cache sont
 * gratuites, §30).
 *
 * RELEVABLE LE TEMPS D'UN RATTRAPAGE. Quand la résolution s'améliore, le cache
 * repart à zéro et le stock met une dizaine de passages à se replacer :
 * `GEOCODE_BUDGET=1500 pnpm reprocess` fait le rattrapage en une fois, sans
 * toucher au plafond des collectes ordinaires.
 */
const GEOCODE_NETWORK_BUDGET = Math.max(
  1,
  Number.parseInt(process.env['GEOCODE_BUDGET'] ?? '', 10) || 80,
);

/**
 * Recherches de DPE au plus par passage, hors cache.
 *
 * Plus généreux que le géocodage : l'ADEME est une API d'État sans quota
 * déclaré, et le stock à rattraper est fini — six cents annonces une fois,
 * puis quelques-unes par jour.
 */
const DPE_NETWORK_BUDGET = 120;

/**
 * Plafond de biens routés par run vers un point transit : borne le nombre
 * d'appels Navitia (les résultats sont mis en cache, donc en régime établi
 * seuls les biens NOUVEAUX en consomment, §30).
 */
const TRANSIT_MAX_LISTINGS = 120;

/**
 * L'adresse à géocoder : uniquement une adresse de rue (numéro/voie), jamais la
 * seule ville (§17, §20).
 *
 * La commune n'est PAS collée ici : le géocodeur la reçoit à part, pour la
 * poser en filtre sur la commune plutôt qu'en mots dans la question. Le code
 * postal reste dehors — les sources posent souvent 06000 par défaut et la BAN
 * lui donnerait la priorité sur la rue.
 */
function geocodeQuery(listing: AggregatedListing): string | null {
  // « 35 Bis Rue de France / » : la ponctuation finale gêne la BAN.
  const address = listing.address.value?.replace(/[\s/,;-]+$/, '') ?? null;
  if (address === null || address.trim().length < 4) return null;
  return address;
}

export interface PipelineOptions {
  readonly registry: SourceRegistry;
  readonly repository: Repository;
  readonly config: PublicConfig;
  readonly referencePoints: readonly ReferencePoint[];
  readonly userAgent: string;
  readonly mode: 'live' | 'backfill';
  /** Ciblage manuel : la ou les sources tournent sans attendre leur tour. */
  readonly force?: boolean;
  /** Temps accordé au démarrage des sources ; huit minutes par défaut. */
  readonly sourcePhaseBudgetMs?: number;
  readonly clock: Clock;
  readonly logger: Logger;
  /** Injection de `fetch` — les tests n'accèdent jamais au réseau (§59). */
  readonly fetchImpl?: typeof fetch;
  /** Routage transports en commun (Navitia). Absent → estimation vol d'oiseau. */
  readonly transitConfig?: TransitConfig;
}

export interface SourceOutcome {
  readonly sourceId: string;
  readonly success: boolean;
  readonly result: ScrapeResult | null;
  readonly error: string | null;
}

/** Changement d'état de santé d'une source entre deux runs (§69, alerting). */
export interface SourceHealthTransition {
  readonly sourceId: string;
  readonly from: SourceHealth;
  readonly to: SourceHealth;
  readonly listingsFound: number;
  readonly error: string | null;
}

export interface PipelineReport {
  readonly sourcesRun: readonly string[];
  readonly sourcesSkipped: readonly { sourceId: string; reason: string }[];
  readonly outcomes: readonly SourceOutcome[];
  /** Sources dont l'état de santé a changé ce run (pour alerter, §69). */
  readonly healthTransitions: readonly SourceHealthTransition[];
  /**
   * Sources dont le cycle de vie a été sauté, avec le motif.
   *
   * CE VERDICT ÉTAIT DÉJÀ CALCULÉ ET JETÉ. Il porte les deux symptômes les plus
   * parlants d'un gabarit qui a changé — inventaire effondré, page rendue sans
   * la moindre annonce — et n'existait que sous forme d'une ligne de journal.
   */
  readonly lifecycleSkips: readonly LifecycleSkip[];
  readonly listingsCollected: number;
  readonly groupsFormed: number;
  readonly comparisons: number;
  /** Écritures au niveau des occurrences — mesure directe de l'économie (§30). */
  readonly occurrencesWritten: { inserted: number; updated: number; unchanged: number };
  /** Écritures au niveau des fiches agrégées. */
  readonly written: { inserted: number; updated: number; unchanged: number };
  readonly durationMs: number;
}

/**
 * Exécute une source et rend son résultat.
 * Ne lève jamais : les erreurs sont converties en `SourceOutcome` en échec,
 * afin qu'une source défaillante n'interrompe pas le run (§69).
 */
async function runSource(
  scraper: Scraper,
  options: PipelineOptions,
  knownRefs: ReadonlySet<string>,
  credentials: SourceCredentials | null,
  lastFullPassAt: string | null,
  memo: string | null,
  robots: RobotsGate,
): Promise<{ outcome: SourceOutcome; nextState: Partial<SourceRuntimeState> }> {
  const { descriptor } = scraper;
  const logger = options.logger.child({ source: descriptor.id });
  const startedAt = new Date(options.clock.now()).toISOString();

  const http = createHttpClient({
    budget: descriptor.budget,
    userAgent: options.userAgent,
    clock: options.clock,
    logger,
    cache: options.repository.httpCache(),
    robots,
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  });

  let requestsUsed = 0;
  // Ce que les fiches ont appris, lu UNE fois pour toute la source : une lecture
  // par annonce coûterait une seconde et demie par centaine.
  const detailMemory = await options.repository.detailDrafts(descriptor.id);
  const context: ScrapeContext = {
    criteria: options.config.criteria,
    mode: options.mode,
    fetch: async (url, init) => {
      requestsUsed += 1;
      return http.get(url, init ?? {});
    },
    isKnown: (ref) => knownRefs.has(ref),
    knownRefs,
    lastFullPassAt,
    detailMemory: {
      get: (ref) => detailMemory.get(ref) ?? null,
      save: (entries) =>
        options.repository.saveDetailDrafts(
          descriptor.id,
          entries,
          new Date(options.clock.now()).toISOString(),
        ),
    },
    pageRefs: {
      get: (url) => options.repository.pageRefs(url),
      set: (url, refs) =>
        options.repository.savePageRefs(url, refs, new Date(options.clock.now()).toISOString()),
    },
    credentials,
    memo,
    log: (event, fields) => logger.debug(event, fields),
    shouldStop: () => requestsUsed >= descriptor.budget.maxPagesPerRun,
  };

  try {
    const result = await scraper.run(context);
    logger.info('source.completed', {
      listings: result.listings.length,
      confirmed: result.confirmedRefs?.length ?? 0,
      requests: result.requestCount,
      pages: result.pagesFetched,
      stopReason: result.stopReason,
      warnings: result.warnings.length,
    });

    // Un parser qui ne DÉCOUVRE plus rien alors qu'il a bien téléchargé des
    // pages signale un changement de structure : la source est dégradée, pas
    // morte (§69). « Découvrir » = de nouvelles annonces OU des références
    // confirmées : une source incrémentale (sitemap, liste à refs connues) qui
    // n'a rien de neuf mais confirme son stock reste saine — ne pas la marquer
    // dégradée à tort.
    const discovered = result.listings.length + (result.confirmedRefs?.length ?? 0);
    // Une page inchangée (304) ne dit rien du parseur : Centragence passait
    // « dégradée » à chaque passage où son site n'avait pas bougé. Une agence
    // qui affiche n'avoir aucune location non plus.
    const degraded =
      result.pagesFetched > 0 &&
      discovered === 0 &&
      result.stopReason !== 'notModified' &&
      result.stopReason !== 'empty';

    return {
      outcome: { sourceId: descriptor.id, success: true, result, error: null },
      nextState: {
        health: degraded ? 'degraded' : 'healthy',
        lastRunAt: startedAt,
        lastSuccessAt: new Date(options.clock.now()).toISOString(),
        consecutiveErrors: 0,
        lastNewListingCount: result.listings.length,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('source.failed', { error: message });

    if (error instanceof RateLimitedError) {
      const until = new Date(
        options.clock.now() + descriptor.budget.cooldownSecondsAfter429 * 1000,
      ).toISOString();
      return {
        outcome: { sourceId: descriptor.id, success: false, result: null, error: message },
        nextState: {
          health: 'cooldown',
          lastRunAt: startedAt,
          last429At: startedAt,
          cooldownUntil: until,
        },
      };
    }

    if (error instanceof BlockedError) {
      // §10 : on ne contourne pas. La source est retirée du roulement.
      return {
        outcome: { sourceId: descriptor.id, success: false, result: null, error: message },
        nextState: { health: 'blocked', lastRunAt: startedAt, lastBlockedAt: startedAt },
      };
    }

    return {
      outcome: { sourceId: descriptor.id, success: false, result: null, error: message },
      nextState: { health: 'degraded', lastRunAt: startedAt },
    };
  }
}

/** Moyenne glissante pondérée, pour lisser l'estimation d'activité (§7). */
function updateAverage(previous: number, latest: number): number {
  return Math.round((previous * 0.7 + latest * 0.3) * 100) / 100;
}

/**
 * Géocode les adresses des fiches qui n'ont pas de GPS mais une adresse de rue
 * (§20). Ne fait aucun appel réseau si aucun point de référence n'est configuré
 * ou si le budget réseau est épuisé — les adresses en cache restent gratuites
 * (§30). Retourne l'association fiche → coordonnées (ou `null` si non résolue).
 */
async function geocodeMissingAddresses(
  merged: readonly AggregatedListing[],
  options: PipelineOptions,
  nowMs: number,
): Promise<Map<string, Coordinates | null>> {
  // Sans condition sur les points de référence DU COMPTE PRINCIPAL : la carte et
  // les trajets des autres comptes ont besoin des mêmes coordonnées.
  const geocoded = new Map<string, Coordinates | null>();

  const cache = memoizeStore(options.repository.geocodeCache());
  const geocoder = createGeocoder({
    cache,
    nowMs,
    userAgent: options.userAgent,
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  });

  // Seulement les annonces sans GPS mais avec une adresse de rue : géocoder
  // une simple ville donnerait un centre-ville trompeur (§17).
  const candidates = merged.flatMap((listing) => {
    if (listing.latitude.value !== null && listing.longitude.value !== null) return [];
    const query = geocodeQuery(listing);
    return query === null ? [] : [{ listing, query }];
  });

  // Le cache se lit en parallèle ; le réseau reste un appel à la fois.
  const cached = await mapLimited(candidates, CACHE_READS_AT_ONCE, ({ listing, query }) =>
    cache.get(geocodeCacheKey(query, listing.city.value)),
  );
  let networkBudget = GEOCODE_NETWORK_BUDGET;
  for (const [index, { listing, query }] of candidates.entries()) {
    if (cached[index] === null) {
      if (networkBudget <= 0) continue; // budget réseau épuisé
      networkBudget -= 1;
    }
    geocoded.set(listing.id, await geocoder.geocode(query, listing.city.value));
  }
  return geocoded;
}

/**
 * Complète le DPE MANQUANT depuis les diagnostics publiés par l'ADEME.
 *
 * IL EST OBLIGATOIRE DANS UNE ANNONCE DE LOCATION DEPUIS 2021, et la moitié des
 * sources ne le publie pas : 589 étiquettes sur 2 708 occurrences actives le
 * 2026-09-10, alors que six cents annonces avaient une adresse de rue. L'ADEME
 * publie tous les diagnostics — 15 630 pour le seul 06200 — avec l'adresse, la
 * surface et l'année de construction, gratuitement et sans clé.
 *
 * ON NE TOUCHE QUE CE QUI MANQUE. Une étiquette publiée par la source fait
 * autorité : c'est le bailleur qui l'engage, pas nous.
 *
 * BUDGET RÉSEAU BORNÉ, comme le géocodage : les adresses déjà cherchées ne
 * coûtent rien, et les nouvelles s'étalent sur quelques passages.
 */
async function fillMissingDpe(
  merged: readonly AggregatedListing[],
  options: PipelineOptions,
  nowMs: number,
): Promise<Map<string, DpeRecord>> {
  const found = new Map<string, DpeRecord>();
  const cache = memoizeStore(options.repository.dpeCache());
  const lookup = createDpeLookup({
    cache,
    nowMs,
    userAgent: options.userAgent,
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  });

  const candidates = merged.flatMap((listing) => {
    const address = listing.address.value;
    const postalCode = listing.postalCode.value;
    const area = listing.area.value;
    if (listing.dpe.value !== null || address === null || postalCode === null || area === null) {
      return [];
    }
    return [{ listing, address, postalCode, area }];
  });

  // Le cache se lit en parallèle ; l'ADEME reste interrogée un appel à la fois.
  const cached = await mapLimited(candidates, CACHE_READS_AT_ONCE, (one) =>
    cache.get(dpeCacheKey(one.address, one.postalCode, one.area)),
  );
  let networkBudget = DPE_NETWORK_BUDGET;
  for (const [index, { listing, address, postalCode, area }] of candidates.entries()) {
    if (cached[index] === null) {
      if (networkBudget <= 0) continue;
      networkBudget -= 1;
    }
    const record = await lookup.find(address, postalCode, area);
    if (record !== null) found.set(listing.id, record);
  }
  return found;
}

/**
 * Calcule le temps de trajet RÉEL en transports en commun (Navitia) vers les
 * points de référence en mode `transit`, pour les biens géolocalisés qui
 * satisfont DÉJÀ les autres critères (§20, §30). Résultats mis en cache ;
 * ne route qu'un nombre borné de biens par run. Retourne, par fiche, la durée
 * par libellé de point. Vide si le routage n'est pas configuré.
 */
async function resolveTransitMinutes(
  merged: readonly AggregatedListing[],
  options: PipelineOptions,
  geocoded: ReadonlyMap<string, Coordinates | null>,
  nowMs: number,
  // Les points et les critères du compte routé ; le compte principal par défaut.
  account: {
    readonly referencePoints: readonly ReferencePoint[];
    readonly criteria: PublicConfig['criteria'];
  } = { referencePoints: options.referencePoints, criteria: options.config.criteria },
): Promise<Map<string, Record<string, number>>> {
  const byListing = new Map<string, Record<string, number>>();
  const transitPoints = account.referencePoints.filter((point) => point.mode === 'transit');
  if (options.transitConfig === undefined || transitPoints.length === 0) return byListing;

  const router = createTransitRouter({
    token: options.transitConfig.token,
    arrivalTime: options.transitConfig.arrivalTime,
    cache: options.repository.transitCache(),
    nowMs,
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  });

  let routed = 0;
  for (const listing of merged) {
    if (routed >= TRANSIT_MAX_LISTINGS) break;
    const latitude = listing.latitude.value ?? geocoded.get(listing.id)?.latitude ?? null;
    const longitude = listing.longitude.value ?? geocoded.get(listing.id)?.longitude ?? null;
    if (latitude === null || longitude === null) continue;
    // On ne route que les candidats déjà retenus par les autres critères, pour
    // ne pas dépenser d'appels sur des biens de toute façon écartés (§30).
    if (!scoreMatch(listing, account.criteria).matchesCriteria) continue;

    routed += 1;
    const byLabel: Record<string, number> = {};
    for (const point of transitPoints) {
      const minutes = await router.arrivalMinutes({ latitude, longitude }, point);
      if (minutes !== null) byLabel[point.label] = minutes;
    }
    if (Object.keys(byLabel).length > 0) byListing.set(listing.id, byLabel);
  }
  return byListing;
}

/**
 * Pourquoi le cycle de vie a été sauté, en DEUX morceaux : un code, que la
 * surveillance des sources trie, et une phrase, que le journal affiche.
 *
 * Le code existe parce qu'il y a deux natures de motifs derrière un même
 * « on ne conclut pas » : ceux qui disent qu'on n'a pas REGARDÉ (passage
 * interrompu, page inchangée) — anodins —, et ceux qui disent qu'on a regardé
 * et que l'inventaire ne ressemble plus à rien. Seuls les seconds méritent
 * qu'on réveille quelqu'un. Relire la phrase pour la trier reviendrait à
 * refaire une décision déjà prise.
 */
export type LifecycleSkipCode =
  /** L'inventaire a fondu : une fraction du stock connu est rendue. */
  | 'collapse'
  /** Rien rendu, sans que la source affiche une liste vide : gabarit changé. */
  | 'emptyWithoutSign'
  /** On n'a pas vu l'inventaire : le silence n'apprend rien sur la source. */
  | 'blind';

export interface LifecycleSkip {
  readonly sourceId: string;
  readonly code: LifecycleSkipCode;
  readonly reason: string;
}

/** Exécute un cycle complet de collecte. */
/**
 * Dit pourquoi il ne faut PAS conclure à l'absence, ou `null` si on le peut.
 *
 * Une annonce ne devient douteuse que si la source a été consultée ET a rendu
 * son inventaire. Deux situations trompaient ce raisonnement :
 *
 *  - un passage qui ÉCHOUE ou ne télécharge rien rend zéro annonce, ce qui
 *    faisait passer tout le stock pour disparu ;
 *  - un passage PARTIEL — identifiants refusés, quota atteint — en rend une
 *    poignée. C'est ce qui est arrivé à une source d'abonné : 18 annonces
 *    rendues au lieu de 83, et 65 biens bien vivants marqués « à vérifier ».
 *
 * Un inventaire ne perd pas la moitié de ses annonces d'un passage à l'autre ;
 * un passage cassé, si.
 */
async function missingWouldBeUnfounded(
  sourceId: string,
  seenCount: number,
  reason: StopReason | undefined,
  repository: Repository,
): Promise<Omit<LifecycleSkip, 'sourceId'> | null> {
  const blind = (why: string): Omit<LifecycleSkip, 'sourceId'> => ({ code: 'blind', reason: why });

  // Rien n'a été observé : aucune information sur ce qui existe encore.
  if (reason === undefined) return blind('aucun résultat');
  if (reason === 'notModified') return blind('page inchangée, rien de retéléchargé');
  if (reason === 'incomplete') return blind('inventaire lu en partie seulement');
  if (reason === 'rateLimited' || reason === 'blocked' || reason === 'tooManyErrors') {
    return blind(`passage interrompu (${reason})`);
  }
  // La source affiche elle-même une liste vide : tout le stock connu est parti.
  if (reason === 'empty') return null;
  // Rien rendu sans ce signe : gabarit changé plutôt qu'agence vidée.
  if (seenCount === 0) {
    return {
      code: 'emptyWithoutSign',
      reason: 'aucune annonce, sans liste vide affichée par la source',
    };
  }

  const known = await repository.activeOccurrenceCount(sourceId);
  if (known >= 10 && seenCount * 2 < known) {
    return {
      code: 'collapse',
      reason: `chute suspecte : ${seenCount} annonces rendues pour ${known} connues`,
    };
  }
  return null;
}

/**
 * Péremption des sources qui n'annoncent qu'une fois : au-delà, l'annonce a
 * toutes les chances d'être partie, sans qu'aucun passage ne puisse le dire.
 *
 * DIX ET VINGT-ET-UN JOURS N'AVAIENT AUCUN RAPPORT AVEC CE MARCHÉ. Mesuré le
 * 2026-09-08 sur les annonces éteintes : soixante-huit sur cent quinze n'ont
 * vécu qu'UN SEUL JOUR, et la durée moyenne est de 1,4 jour. La courbe de
 * survie des sources qui se re-listent — les seules qu'on puisse observer
 * honnêtement — donne une annonce FNAIM sur cinq déjà partie au troisième
 * jour.
 *
 * Une annonce de digest gardée trois semaines n'est donc pas une précaution,
 * c'est un lien mort qu'on fait visiter. Le coût des deux erreurs n'est pas le
 * même : marquer « peut-être retirée » un bien encore libre se rattrape d'un
 * clic, tandis qu'un déplacement pour rien ne se rattrape pas.
 *
 * Quatre jours pour le doute, dix pour le retrait : encore généreux au regard
 * de ce qu'on observe, mais on ne re-vérifie jamais ces annonces — la prudence
 * garde sa part.
 */
const ONE_SHOT_EXPIRY = { possiblyInactiveAfterDays: 4, inactiveAfterDays: 10 } as const;

interface LifecycleDeps {
  readonly rawBySource: ReadonlyMap<string, readonly RawListing[]>;
  readonly confirmedBySource: ReadonlyMap<string, readonly string[]>;
  readonly outcomes: readonly SourceOutcome[];
  readonly registry: SourceRegistry;
  readonly repository: Repository;
  readonly config: PublicConfig;
  readonly logger: Logger;
  /** Instant du passage, pour dater les confirmations. */
  readonly nowIso: string;
}

/**
 * Vieillit les annonces non revues, source par source (§32).
 *
 * Les refs confirmées par la source sans re-téléchargement (sitemap) comptent
 * comme vues : leur fiche n'a pas été visitée, mais la source les dit publiées.
 */
async function applyLifecycle(deps: LifecycleDeps): Promise<LifecycleSkip[]> {
  const { rawBySource, confirmedBySource, outcomes, registry, repository, config, logger, nowIso } =
    deps;
  const skipped: LifecycleSkip[] = [];

  for (const [sourceId, raws] of rawBySource) {
    // Source qui n'annonce qu'une fois : le temps remplace le décompte.
    if (registry.get(sourceId)?.descriptor.oneShotListings === true) {
      await repository.expireByAge(sourceId, ONE_SHOT_EXPIRY);
      // MIEUX QUE L'ANCIENNETÉ QUAND ON L'A : le portail d'origine est parfois
      // une source à part entière, et sait, lui, que l'annonce est partie.
      const retired = await repository.retireRelayedByOrigin(
        sourceId,
        registry.descriptors().map((descriptor) => descriptor.id),
      );
      if (retired > 0) logger.info('lifecycle.relayed_retired', { sourceId, retired });
      continue;
    }

    const seen = new Set(raws.map((raw) => raw.sourceRef));
    const confirmed = confirmedBySource.get(sourceId) ?? [];
    for (const ref of confirmed) seen.add(ref);

    /**
     * UNE ANNONCE CONFIRMÉE EST UNE ANNONCE VUE, et on la traite comme telle.
     *
     * Elle était seulement épargnée du décompte : une annonce en doute qui
     * réapparaissait par confirmation — liste relue sans retélécharger la
     * fiche, page inchangée — gardait son compteur d'absences et restait
     * « peut-être retirée », alors que la source la dit publiée. Quinze
     * sources confirment ainsi.
     *
     * APRÈS le cas des sources à annonce unique, et c'est voulu : celles-là se
     * périment à l'âge, et les confirmer les maintiendrait en vie indéfiniment.
     */
    if (confirmed.length > 0) await repository.confirmSeen(sourceId, confirmed, nowIso);

    const reason = outcomes.find((o) => o.sourceId === sourceId)?.result?.stopReason;
    const skip = await missingWouldBeUnfounded(sourceId, seen.size, reason, repository);
    if (skip !== null) {
      // Conclure à l'absence sans avoir regardé ferait passer des annonces
      // bien vivantes pour douteuses (§17).
      logger.warn('lifecycle.skipped', { sourceId, reason: skip.reason });
      skipped.push({ sourceId, ...skip });
      continue;
    }

    await repository.markMissing(sourceId, seen, {
      possiblyInactiveAfter: config.missingRunsBeforePossiblyInactive,
      inactiveAfter: config.missingRunsBeforeInactive,
    });
  }
  return skipped;
}

/**
 * Complète les annonces sans coordonnées par le contact GÉNÉRAL de l'agence.
 *
 * Beaucoup d'agences n'offrent qu'un formulaire sur leurs annonces, mais
 * publient leur ligne en pied de page. Cette ligne vaut mieux que rien : elle
 * permet d'appeler au lieu de remplir un formulaire et d'attendre.
 *
 * Ne remplace JAMAIS une coordonnée portée par l'annonce : celle-là vise le bon
 * interlocuteur, celle-ci l'accueil (§17).
 */
function withAgencyContact(
  listings: readonly NormalizedListing[],
  sourceId: string,
  scrapers: readonly Scraper[],
): NormalizedListing[] {
  const fallback = scrapers.find((s) => s.descriptor.id === sourceId)?.descriptor.agencyContact;
  return fallback === undefined ? [...listings] : listings.map((l) => fillContact(l, fallback));
}

/**
 * LE MÊME REPLI SUR TOUT LE STOCK, au regroupement. Posé à la seule collecte, il
 * manquait aux annonces lues AVANT que le descripteur ne porte les coordonnées
 * de l'agence : une liste inchangée (304) ne les réécrit jamais. Relevé du
 * 2026-09-15 : aucune annonce Méditerranée Immo n'avait son téléphone.
 */
function withAgencyContacts(
  corpus: readonly NormalizedListing[],
  registry: PipelineOptions['registry'],
): NormalizedListing[] {
  return corpus.map((listing) => {
    const fallback = registry.get(listing.sourceId)?.descriptor.agencyContact;
    return fallback === undefined ? listing : fillContact(listing, fallback);
  });
}

function fillContact(
  listing: NormalizedListing,
  fallback: NonNullable<Scraper['descriptor']['agencyContact']>,
): NormalizedListing {
  const phone = listing.contact.phone ?? fallback.phone ?? null;
  const email = listing.contact.email ?? fallback.email ?? null;
  if (phone === listing.contact.phone && email === listing.contact.email) return listing;
  return { ...listing, contact: { ...listing.contact, phone, email } };
}

/** Ce que produit un passage de regroupement + scoring sur le corpus stocké. */
export interface RegroupReport {
  readonly groups: readonly { readonly occurrences: readonly NormalizedListing[] }[];
  readonly comparisonCount: number;
  readonly listingReport: UpsertReport;
}

/**
 * Dédoublonne, fusionne, score et persiste TOUT le corpus vivant.
 *
 * Cet étage ne dépend d'aucun scraper : il part des occurrences déjà en base.
 * C'est ce qui permet de le rejouer seul (`pnpm reprocess`) après une
 * amélioration du scoring ou de l'extraction, sans re-solliciter les sources
 * (§30) — et c'est le MÊME code que la collecte, donc sans divergence possible.
 *
 * Le regroupement porte sur toutes les annonces vivantes, pas seulement sur
 * celles du run : une annonce collectée aujourd'hui peut être le doublon d'une
 * annonce vue la semaine dernière sur une autre source (§13).
 */

/**
 * La PERTINENCE, calculée pour chaque compte.
 *
 * L'annonce est commune ; la lecture qu'on en fait ne l'est pas. Tant qu'il n'y
 * avait qu'un utilisateur, `matches_criteria` pouvait vivre sur la fiche. Dès
 * qu'il y en a deux, cette colonne ment au second : sa liste est filtrée sur le
 * budget du premier, et ses notifications aussi.
 *
 * ON RÉUTILISE `scoreListing`, sans rien réécrire. « Correspond aux critères »
 * n'est pas une comparaison : c'est la ville et ses variantes, le loyer et son
 * plancher anti-parking, la surface, le trajet, le type de bien, et la règle
 * qui veut qu'une donnée absente n'élimine jamais (§17). Une seconde définition
 * — en SQL, par exemple — diverge toujours de la première.
 *
 * LE COMPTE SERVI PAR LA COLLECTE GARDE SON SCORE TEL QUEL : il vient d'être
 * calculé avec les temps de trajet réels, il serait absurde de le refaire.
 *
 * LES AUTRES SONT SCORÉS AVEC LEURS PROPRES points de référence, mais SANS
 * routage : un appel Navitia par annonce et par destination, multiplié par le
 * nombre de comptes, épuiserait le quota gratuit (§30). Ils obtiennent donc
 * l'estimation à vol d'oiseau — exactement ce que fait le système quand Navitia
 * n'est pas configuré, et le détail du score le dit.
 *
 * LA BAISSE DE PRIX, ELLE, EST COMMUNE. Qu'une annonce ait baissé est un fait
 * sur le marché, pas sur une personne : la liste est déjà calculée une fois
 * pour le run, et la partager ne coûte pas une requête de plus. Elle était
 * remplacée ici par un ensemble vide, si bien que les autres comptes seuls
 * ignoraient la remontée de priorité que ce signal vaut.
 */
async function scoreForEachUser(deps: {
  readonly options: PipelineOptions;
  readonly merged: readonly AggregatedListing[];
  readonly scored: readonly ScoredListing[];
  readonly geocoded: ReadonlyMap<string, Coordinates | null>;
  readonly nowMs: number;
  readonly priceDroppedIds: ReadonlySet<string>;
}): Promise<void> {
  const { options, merged, scored, geocoded, nowMs, priceDroppedIds } = deps;
  const { repository, logger, config } = options;

  const users = await repository.scorableUsers();
  for (const userId of users) {
    if (userId === CURRENT_USER) {
      const written = await repository.saveUserScores(userId, scored);
      if (written > 0) logger.info('pipeline.user_scored', { userId, written });
      continue;
    }

    const criteria = withStoredCriteria(
      config,
      await repository.readSettingFor(userId, SEARCH_CRITERIA_SETTING),
    ).criteria;
    const referencePoints = await resolveReferencePoints({
      cache: repository.geocodeCache(),
      nowMs,
      logger,
      stored: await repository.readSettingFor(userId, REFERENCE_POINTS_SETTING),
    });

    // LE TRAJET RÉEL AUSSI, avec SES points : sans lui, ce compte n'avait qu'une
    // estimation à vol d'oiseau, et son plafond de trajet jugeait sur elle. Le
    // cache Navitia est commun — un même trajet ne se paie qu'une fois.
    const transit = await resolveTransitMinutes(merged, options, geocoded, nowMs, {
      referencePoints,
      criteria,
    });
    const theirs = merged.map((listing) => {
      const coords = geocoded.get(listing.id) ?? null;
      const transitMinutes = transit.get(listing.id);
      return scoreListing(listing, {
        criteria,
        nowMs,
        referencePricePerSqm: config.referencePricePerSqm,
        referencePoints,
        priceDroppedIds,
        resolvedCoordinates: coords,
        ...(transitMinutes !== undefined ? { resolvedTransitMinutes: transitMinutes } : {}),
      });
    });
    const written = await repository.saveUserScores(userId, theirs);
    if (written > 0) logger.info('pipeline.user_scored', { userId, written });
  }
}

export async function regroupAndScore(
  options: PipelineOptions,
  nowMs: number,
): Promise<RegroupReport> {
  const { repository, logger, config } = options;

  const corpus = withAgencyContacts(await repository.allActiveOccurrences(), options.registry);
  // Le registre sait quelles sources RELAIENT des annonces publiées ailleurs :
  // chez elles, une photo partagée désigne le même bien (§14).
  const { groups, comparisonCount } = dedupe(corpus, {
    relaysListings: (sourceId) =>
      options.registry.get(sourceId)?.descriptor.relaysListings === true,
    // Deux canaux d'une même maison publient le même stock : BEP Logement le
    // fait sur son site public et dans son bulletin abonnés, avec des
    // références et des photos qui ne se ressemblent en rien.
    operatorOf: (sourceId) => options.registry.get(sourceId)?.descriptor.operator ?? null,
  });
  logger.info('pipeline.deduplicated', { groups: groups.length, comparisons: comparisonCount });

  // Baisses de loyer des 14 derniers jours : signal d'opportunité (§17).
  const priceDropSince = new Date(nowMs - 14 * 24 * 60 * 60 * 1000).toISOString();
  const priceDroppedIds = await repository.recentPriceDropIds(priceDropSince);

  const merged = groups.map((group) => mergeGroup(group.occurrences));

  // Le DPE manquant, cherché à l'adresse chez l'ADEME. AVANT le scoring : il
  // s'affiche, il se filtre, et une étiquette qui arriverait après serait
  // invisible jusqu'au passage suivant.
  const dpeByListing = await fillMissingDpe(merged, options, nowMs);
  if (dpeByListing.size > 0) {
    logger.info('pipeline.dpe_filled', { listings: dpeByListing.size });
  }

  const geocoded = await geocodeMissingAddresses(merged, options, nowMs);
  if (geocoded.size > 0) {
    logger.info('pipeline.geocoded', {
      resolved: [...geocoded.values()].filter((c) => c !== null).length,
      attempted: geocoded.size,
    });
  }

  // Temps de trajet réel en transports en commun (Navitia), pour l'affichage
  // ET le plafond de trajet (maxCommuteMinutes → hors critères).
  const transitByListing = await resolveTransitMinutes(merged, options, geocoded, nowMs);
  if (transitByListing.size > 0) {
    logger.info('pipeline.transit_resolved', { listings: transitByListing.size });
  }

  const scored: ScoredListing[] = merged.map((listing) => {
    const coords = geocoded.get(listing.id) ?? null;
    // Coordonnées géocodées PERSISTÉES sur la fiche quand la source n'en
    // publie pas : la vue carte et le dédoublonnage en profitent. La
    // provenance « geocode » dit honnêtement d'où vient la valeur (§15).
    const enriched =
      coords !== null && listing.latitude.value === null
        ? {
            ...listing,
            latitude: {
              value: coords.latitude,
              sourceId: 'geocode',
              observedAt: new Date(nowMs).toISOString(),
              conflicts: [],
            },
            longitude: {
              value: coords.longitude,
              sourceId: 'geocode',
              observedAt: new Date(nowMs).toISOString(),
              conflicts: [],
            },
          }
        : listing;

    /**
     * LE DPE VENU DE L'ADEME, quand la source n'en publie aucun. La provenance
     * dit d'ou il vient — c'est un diagnostic officiel trouve a l'adresse, pas
     * une valeur annoncee par le bailleur, et la fiche ne doit pas laisser
     * croire l'inverse.
     *
     * LE GES VIENT AVEC, sans un appel de plus : le meme diagnostic porte les
     * deux etiquettes, et le cache les gardait toutes les deux depuis le debut.
     * Il ne remplace pas un GES publie par la source, meme regle que le DPE.
     */
    const diagnostic = dpeByListing.get(listing.id);
    const stamp = { sourceId: 'ademe', observedAt: new Date(nowMs).toISOString(), conflicts: [] };
    const complete =
      diagnostic === undefined
        ? enriched
        : {
            ...enriched,
            dpe: { value: diagnostic.label, ...stamp },
            ...(diagnostic.gesLabel !== null && enriched.ges.value === null
              ? { ges: { value: diagnostic.gesLabel, ...stamp } }
              : {}),
          };

    const transitMinutes = transitByListing.get(listing.id);
    return scoreListing(complete, {
      criteria: config.criteria,
      nowMs,
      referencePricePerSqm: config.referencePricePerSqm,
      referencePoints: options.referencePoints,
      priceDroppedIds,
      resolvedCoordinates: coords,
      ...(transitMinutes !== undefined ? { resolvedTransitMinutes: transitMinutes } : {}),
    });
  });

  const listingReport = await repository.saveListings(scored);
  logger.info('pipeline.listings_written', { ...listingReport });

  // APRÈS L'ÉCRITURE, ET PAS AVANT : le regroupement ne voit que les
  // occurrences vivantes, donc les fiches dont la dernière vient de s'éteindre
  // ne figurent pas dans `scored` et gardent leur cycle de vie d'hier. Sans ce
  // passage, elles restent affichées indéfiniment.
  const retired = await repository.retireDepartedListings();
  if (retired > 0) logger.info('pipeline.listings_retired', { retired });

  await scoreForEachUser({ options, merged, scored, geocoded, nowMs, priceDroppedIds });

  return { groups, comparisonCount, listingReport };
}

/**
 * Combien d'annonces chaque compte a apportées par son transfert d'alertes.
 *
 * Seule la source e-mail pose `forwardedBy`, et seulement quand l'adresse visée
 * portait un jeton connu : une annonce arrivée sur l'adresse simple n'est
 * comptée pour personne, ce qui est exact — on ignore qui l'a fait suivre.
 */
function countAlertsByToken(
  rawBySource: ReadonlyMap<string, readonly RawListing[]>,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const raws of rawBySource.values()) {
    for (const raw of raws) {
      const token = raw.extra?.['forwardedBy'];
      if (token === undefined || token === '') continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Les identifiants d une source payee, declares depuis le site.
 *
 * ON PREND LE PREMIER QUI SE DECHIFFRE. Le stock collecte entre dans la base
 * COMMUNE : un abonnement suffit a servir tout le monde, et collecter la meme
 * source une fois par compte ne rapporterait rien de plus a personne.
 *
 * Un secret qu on ne sait plus lire — cle changee, ligne d une autre
 * installation — est traite comme absent, jamais comme une panne (§17) : on
 * passe au suivant, et l environnement reste le dernier recours.
 *
 * CE QU ON NE FAIT PAS, ET POURQUOI. Le premier qui se dechiffre n est pas
 * forcement celui qui FONCTIONNE : un abonnement expire depuis, et la source
 * echoue alors que les identifiants d un autre compte attendent juste
 * derriere. La correction evidente — essayer le suivant sur echec — serait
 * pire que le mal : enchainer des tentatives de connexion sur un site
 * d abonnes, c est exactement ce qui declenche un verrouillage de compte ou un
 * bannissement d adresse (§10). On prefere echouer clairement, en NOMMANT
 * l identifiant fautif dans l avertissement, pour que la personne concernee
 * corrige le sien depuis l ecran.
 */
async function resolveCredentials(
  repository: Repository,
  sourceId: string,
  logger: Logger,
): Promise<SourceCredentials | null> {
  const key = process.env['CREDENTIALS_KEY'];
  if (key === undefined || key.trim() === '') return null;
  for (const stored of await repository.sourceCredentials(sourceId)) {
    const password = await decryptSecret(stored.secretEncrypted, key);
    if (password === null) {
      logger.warn('credentials.unreadable', { sourceId });
      continue;
    }
    return { user: stored.login, password };
  }
  return null;
}

/**
 * L'état d'une source après son passage.
 *
 * Un passage COMPLET se date : c'est ce qui dit à la source quand le suivant
 * est dû. Un passage partiel garde la date précédente, et le repère de lecture
 * (`memo`) suit la même règle.
 */
function stateAfterRun(
  base: SourceRuntimeState,
  nextState: Partial<SourceRuntimeState>,
  outcome: SourceOutcome,
  startedMs: number,
): SourceRuntimeState {
  return {
    ...base,
    ...nextState,
    ...(outcome.result?.fullPass === true
      ? { lastFullPassAt: new Date(startedMs).toISOString() }
      : {}),
    // Le repère n'avance QUE si la source en a rendu un : un passage
    // interrompu garde celui d'avant, et relira donc ce qu'il n'a pas lu.
    ...(outcome.result?.memo !== undefined ? { memo: outcome.result.memo } : {}),
    consecutiveErrors: outcome.success ? 0 : base.consecutiveErrors + 1,
    averageNewListingCount: updateAverage(
      base.averageNewListingCount,
      outcome.result?.listings.length ?? 0,
    ),
  };
}

export async function runPipeline(options: PipelineOptions): Promise<PipelineReport> {
  const { registry, repository, logger, clock, config } = options;
  const startedMs = clock.now();

  // --- 1. Quelles sources doivent tourner ? --------------------------------
  const scrapers = registry.enabled();
  const entries = await Promise.all(
    scrapers.map(async (scraper) => ({
      descriptor: scraper.descriptor,
      state: await repository.loadSourceState(scraper.descriptor.id),
    })),
  );

  /**
   * CE QU'UNE ALERTE E-MAIL A NOMMÉ. Le digest d'un portail dit parfois de
   * quelle agence vient l'annonce ; si nous collectons cette agence, son
   * catalogue en dit bien plus — adresse, téléphone, charges, DPE — et il est
   * déjà à jour au moment où le message arrive. On avance son tour, sans
   * requête hors cadence ni budget touché.
   */
  const expected = awaitedSources(
    entries.find((entry) => entry.descriptor.id === EMAIL_ALERTS_DESCRIPTOR.id)?.state.memo ?? null,
    entries.map((entry) => entry.descriptor),
    clock.now(),
  );

  /**
   * CE QUE CHAQUE SOURCE PERD ENTRE DEUX PASSAGES.
   *
   * Les places d'un cycle sont comptées : la file sert un passage demandé sur
   * deux. Ce chiffre dit lesquelles doivent les avoir en premier — celles dont
   * les annonces ne tiennent pas jusqu'à notre retour. Une lecture par cycle,
   * agrégée par la base.
   */
  const vanishRates = await repository.vanishRates(
    VANISH_WINDOW_DAYS,
    config.missingRunsBeforeInactive,
  );

  const plan = planRun(entries, clock.now(), {
    maxSourcesPerRun: options.force === true ? entries.length : config.maxSourcesPerRun,
    ...(options.force === true ? { force: true } : {}),
    ...(expected.size > 0 ? { expected } : {}),
    vanishRates,
  });
  logger.info('scheduler.plan', {
    selected: plan.selected.map((decision) => decision.sourceId),
    skipped: plan.skipped.length,
    ...(expected.size > 0 ? { awaitedByMail: [...expected.keys()] } : {}),
    vanishing: [...vanishingSources(vanishRates)],
  });

  // --- 2. Collecte, source par source, en isolation -------------------------
  const outcomes: SourceOutcome[] = [];
  const healthTransitions: SourceHealthTransition[] = [];
  const rawBySource = new Map<string, readonly RawListing[]>();
  const confirmedBySource = new Map<string, readonly string[]>();
  const rentedBySource = new Map<string, readonly string[]>();
  const withdrawnBySource = new Map<string, readonly string[]>();

  // EN PARALLÈLE, un site à la fois. Une source qui n'a pas démarré avant la fin
  // du budget de temps n'est pas comptée comme passée : elle reste due.
  const notStarted: string[] = [];
  const robots = createRobotsGate({
    userAgent: options.userAgent,
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  });
  await runGrouped(
    plan.selected,
    (decision) => registry.get(decision.sourceId)?.descriptor.domain ?? decision.sourceId,
    SOURCES_AT_ONCE,
    async (decision) => {
      if (clock.now() - startedMs > (options.sourcePhaseBudgetMs ?? SOURCE_PHASE_BUDGET_MS)) {
        notStarted.push(decision.sourceId);
        return;
      }
      const scraper = registry.get(decision.sourceId);
      if (scraper === undefined) return;

      const knownRefs = await repository.knownRefs(decision.sourceId);
      const previousState = entries.find(
        (entry) => entry.descriptor.id === decision.sourceId,
      )?.state;
      const credentials = await resolveCredentials(repository, decision.sourceId, logger);
      const { outcome, nextState } = await runSource(
        scraper,
        options,
        knownRefs,
        credentials,
        previousState?.lastFullPassAt ?? null,
        previousState?.memo ?? null,
        robots,
      );
      outcomes.push(outcome);

      if (outcome.result !== null) {
        rawBySource.set(decision.sourceId, outcome.result.listings);
        confirmedBySource.set(decision.sourceId, outcome.result.confirmedRefs ?? []);
        rentedBySource.set(decision.sourceId, outcome.result.rentedRefs ?? []);
        withdrawnBySource.set(decision.sourceId, outcome.result.withdrawnRefs ?? []);
      }

      const base = previousState ?? (await repository.loadSourceState(decision.sourceId));
      await repository.saveSourceState(stateAfterRun(base, nextState, outcome, startedMs));

      // Transition d'état de santé : c'est le changement (et non l'état stable)
      // qui mérite une alerte, pour ne pas répéter le même avertissement à chaque
      // run tant qu'une source reste dégradée.
      if (nextState.health !== undefined && nextState.health !== base.health) {
        healthTransitions.push({
          sourceId: decision.sourceId,
          from: base.health,
          to: nextState.health,
          listingsFound: outcome.result?.listings.length ?? 0,
          error: outcome.error,
        });
      }

      if (outcome.result !== null) {
        await repository.recordRun({
          id: randomUUID(),
          sourceId: decision.sourceId,
          startedAt: new Date(startedMs).toISOString(),
          finishedAt: new Date(clock.now()).toISOString(),
          requestCount: outcome.result.requestCount,
          pagesFetched: outcome.result.pagesFetched,
          listingsFound: outcome.result.listings.length,
          listingsNew: outcome.result.listings.filter((l) => !knownRefs.has(l.sourceRef)).length,
          listingsUpdated: 0,
          duplicates: 0,
          errors: outcome.success ? 0 : 1,
          stopReason: outcome.result.stopReason,
          warnings: outcome.result.warnings,
        });
      }
    },
  );
  if (notStarted.length > 0) {
    logger.info('scheduler.deferred', { sources: notStarted });
  }

  // --- 3. Normalisation -----------------------------------------------------
  const nowMs = clock.now();
  const normalized = [...rawBySource.entries()].flatMap(([sourceId, raws]) => {
    // Le descripteur peut déclarer la nature de ses bailleurs — PAP ne publie
    // que du particulier à particulier. C'est un fait sur la SOURCE, pas une
    // supposition sur l'annonce, et c'est le seul indice disponible pour les
    // digests de portails, qui n'ont aucune description à fouiller (§17).
    const descriptor = scrapers.find((one) => one.descriptor.id === sourceId)?.descriptor;
    const landlord = descriptor?.landlord;
    return withAgencyContact(
      normalizeAll(raws, {
        sourceId,
        nowMs,
        ...(landlord !== undefined ? { landlord } : {}),
        hostsWantedAds: descriptor?.hostsWantedAds === true,
        // Une annonce de quelqu'un qui CHERCHE un logement : nommée dans le
        // journal, retirée ou non, pour qu'on puisse la retrouver et juger.
        onWantedAd: (raw, evidence, excluded) => {
          logger.warn(excluded ? 'listing.wanted_ad_dropped' : 'listing.wanted_ad_seen', {
            source: sourceId,
            ref: raw.sourceRef,
            url: raw.sourceUrl,
            motif: evidence,
          });
        },
      }),
      sourceId,
      scrapers,
    );
  });
  logger.info('pipeline.normalized', { count: normalized.length });

  // --- 4. Persistance des occurrences --------------------------------------
  const occurrenceReport = await repository.upsertOccurrences(normalized);
  logger.info('pipeline.occurrences_written', { ...occurrenceReport });

  // Ce que le transfert d'alertes de chaque compte a apporté (§6). Le jeton
  // voyage sur l'annonce depuis la source e-mail ; c'est ici qu'il redevient
  // une information utile à quelqu'un.
  const alertsByToken = countAlertsByToken(rawBySource);
  if (alertsByToken.size > 0) {
    await repository.recordAlertReception(alertsByToken);
    logger.info('pipeline.alerts_attributed', { accounts: alertsByToken.size });
  }

  // Cycle de vie des annonces non revues, source par source (§32). Les refs
  // confirmées par la source sans re-téléchargement (sitemap) comptent comme
  // vues : leur fiche n'a pas été visitée, mais la source les dit publiées.
  const lifecycleSkips = await applyLifecycle({
    rawBySource,
    confirmedBySource,
    outcomes,
    registry,
    repository,
    config,
    logger,
    nowIso: new Date(clock.now()).toISOString(),
  });

  // Retrait dit par la source : APRÈS l'écriture et les confirmations, qui
  // remettent l'occurrence en ligne, et AVANT le regroupement, qui éteint la fiche.
  let withdrawn = 0;
  for (const [sourceId, refs] of withdrawnBySource) {
    withdrawn += await repository.markWithdrawn(sourceId, refs, config.missingRunsBeforeInactive);
  }
  if (withdrawn > 0) logger.info('pipeline.withdrawn_marked', { count: withdrawn });

  // --- 5 & 6. Dédoublonnage, fusion, scoring, persistance ------------------
  const { groups, comparisonCount, listingReport } = await regroupAndScore(options, nowMs);

  // Instantané du jour : ces chiffres ne sont pas reconstituables après coup,
  // il faut les mesurer au moment où ils sont vrais (§33).
  await repository.recordDailyStat();

  // Biens signalés « déjà loués » : on les marque APRÈS l'écriture, pour que le
  // lien occurrence → fiche existe. Ils sortent de la liste active mais restent
  // en favori (grisés) et comptent dans les stats (§32, §33).
  let rentedMarked = 0;
  for (const [sourceId, refs] of rentedBySource) {
    if (refs.length > 0) rentedMarked += await repository.markRented(sourceId, refs);
  }
  if (rentedMarked > 0) logger.info('pipeline.rented_marked', { count: rentedMarked });

  return {
    sourcesRun: plan.selected
      .map((decision) => decision.sourceId)
      .filter((sourceId) => !notStarted.includes(sourceId)),
    sourcesSkipped: plan.skipped.map((decision) => ({
      sourceId: decision.sourceId,
      reason: decision.reason,
    })),
    outcomes,
    healthTransitions,
    lifecycleSkips,
    listingsCollected: normalized.length,
    groupsFormed: groups.length,
    comparisons: comparisonCount,
    occurrencesWritten: occurrenceReport,
    written: listingReport,
    durationMs: clock.now() - startedMs,
  };
}
