/**
 * Source : Foncia (réseau d'agences / administrateur de biens).
 *
 * POURQUOI CETTE SOURCE — voir `docs/sources.md` pour l'étude complète.
 *
 *   - Premier administrateur de biens de France : gros volume de gestion
 *     locative en propre, dont une partie n'apparaît pas ailleurs (§3).
 *   - Pages `/location/{ville}/appartement` en SSR, non interdites par le
 *     robots.txt (revérifié le 2026-09-14).
 *   - Le titre des cartes contient l'ADRESSE COMPLÈTE du bien : signal de
 *     dédoublonnage très fort (§14).
 *
 * La liste est paginée par le chemin (`/page-2`), 15 annonces par page : lire
 * la seule première page laissait 7 annonces niçoises sur 22 de côté.
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
import {
  parseAgencies,
  parseAgencyByReference,
  parseApplicationOverview,
  parseDetail,
  parseSearchPage,
  parseWithdrawn,
} from './parser.js';

/** Première page de la liste des appartements niçois. */
const ENTRY_URL = 'https://fr.foncia.com/location/nice-06000/appartement';

/** 15 annonces par page : 22 à Nice le 2026-09-14, la marge couvre 75. */
const MAX_LIST_PAGES = 5;
const PAGE_SIZE = 15;

/**
 * Page des agences de la ville : le SEUL endroit où Foncia publie un téléphone
 * et une adresse e-mail. Les fiches, elles, n'offrent qu'un formulaire web.
 * Une requête couvre toutes les agences de Nice.
 */
const AGENCIES_URL = 'https://fr.foncia.com/agence-immobiliere/agences-immo/nice-06_location';

/**
 * Fiches vérifiées par exécution parmi les annonces disparues de la liste.
 *
 * Une disparition ne dit rien à elle seule. La fiche, elle, tranche — Foncia y
 * remplace le bien par « Cette annonce n'est plus disponible » et bascule son
 * `status` à `deleted`.
 */
const MAX_WITHDRAWN_CHECKS = 5;

/**
 * Fiches visitées par exécution, pour les annonces NOUVELLES seulement : la
 * carte ne donne qu'une demi-phrase de description, la fiche le texte complet.
 */
const MAX_DETAILS = 10;

/**
 * API qu'appelle la fiche pour choisir entre « Je dépose mon dossier » et
 * « Dépôt de candidature : complet ». Anonyme, une requête par annonce.
 */
const APPLICATIONS_API =
  'https://fnc-api.prod.fonciatech.net/parcours-locataire/api/v1/properties/overview';

/** De quoi vérifier chaque annonce que la liste peut porter. */
const MAX_APPLICATION_CHECKS = MAX_LIST_PAGES * PAGE_SIZE;

/** Les annonces collectées sont toutes des appartements niçois. */
const listingUrl = (reference: string): string =>
  `https://fr.foncia.com/location/nice-06/appartement/${reference}.htm`;

const overviewUrl = (reference: string, agency: string): string =>
  `${APPLICATIONS_API}?propertyId=${encodeURIComponent(reference)}&agencyId=${encodeURIComponent(agency)}`;

export const FONCIA_DESCRIPTOR: SourceDescriptor = {
  id: 'foncia',
  name: 'Foncia',
  domain: 'fr.foncia.com',
  kind: 'agencyNetwork',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('agencyNetwork'),
  budget: budgetFor('agencyNetwork', {
    maxPagesPerRun:
      MAX_LIST_PAGES + 1 + MAX_WITHDRAWN_CHECKS + MAX_APPLICATION_CHECKS + MAX_DETAILS,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  allowedPaths: [
    '/location/*',
    '/agence-immobiliere/*',
    'fnc-api.prod.fonciatech.net/parcours-locataire/api/v1/properties/overview',
  ],
  notes:
    'robots.txt vérifié le 2026-09-14 : URLs à paramètres interdites (sauf ' +
    '?datemaj), pages /location/{ville}/{type} et leur pagination ' +
    '/page-N autorisées. SSR Angular : ancrage sur les classes foncia-card-*, ' +
    'jamais sur les attributs générés _ngcontent-*. 15 annonces par page, ' +
    'toutes les pages sont lues (22 annonces à Nice le 2026-09-14). Les ' +
    'annonces DISPARUES de la liste voient leur fiche vérifiée (5 par run). ' +
    'Les fiches des annonces nouvelles sont visitées (10 par exécution) pour ' +
    'la description entière. Candidature en ligne : une requête par annonce ' +
    'à l’API anonyme fnc-api.prod.fonciatech.net/parcours-locataire (celle ' +
    'que la fiche appelle), qui dit loué, complet ou ouvert.',
};

/** Ce qu'une vérification a coûté, et si la source a demandé d'arrêter. */
interface CheckCost {
  readonly requestCount: number;
  readonly pagesFetched: number;
  readonly rateLimited: boolean;
}

/** Demande aux fiches disparues si elles sont retirées. */
async function checkWithdrawn(
  context: ScrapeContext,
  vanished: readonly string[],
): Promise<CheckCost & { rentedRefs: string[] }> {
  const rentedRefs: string[] = [];
  let requestCount = 0;
  let pagesFetched = 0;
  let rateLimited = false;

  for (const reference of vanished.slice(0, MAX_WITHDRAWN_CHECKS)) {
    if (context.shouldStop()) break;
    const url = listingUrl(reference);
    try {
      const page = await context.fetch(url);
      requestCount += 1;
      if (page.notModified) continue;
      pagesFetched += 1;
      if (parseWithdrawn(page.body, reference)) rentedRefs.push(reference);
    } catch (error) {
      // Une fiche injoignable ne prouve rien : l'annonce garde son doute (§17).
      const message = error instanceof Error ? error.message : String(error);
      context.log('withdrawn.check_failed', { reference, error: message });
      if (message.includes('429')) {
        rateLimited = true;
        break;
      }
    }
  }

  return { rentedRefs, requestCount, pagesFetched, rateLimited };
}

/**
 * Demande à l'API de candidature où en est chaque annonce.
 *
 * Pose `extra.applicationStatus` (`open` / `full`) sur les annonces dont la
 * réponse le dit, et rend les références louées. Une annonce sans numéro
 * d'agence n'est pas demandée : un mauvais numéro répond « pas de candidature
 * en ligne ». Un échec ne conclut rien ; un 429 arrête la série.
 */
export async function checkApplications(
  context: ScrapeContext,
  listings: readonly RawListing[],
  agencyOf: ReadonlyMap<string, string>,
): Promise<CheckCost & { listings: RawListing[]; rentedRefs: string[] }> {
  const rentedRefs: string[] = [];
  const statusOf = new Map<string, string>();
  let requestCount = 0;
  let pagesFetched = 0;
  let rateLimited = false;
  let checks = 0;

  for (const listing of listings) {
    const agency = agencyOf.get(listing.sourceRef);
    if (agency === undefined) continue;
    if (checks >= MAX_APPLICATION_CHECKS || context.shouldStop()) break;
    checks += 1;
    try {
      // Non conditionnelle : un 304 ne dirait pas où en est le compteur.
      const response = await context.fetch(overviewUrl(listing.sourceRef, agency), {
        headers: { accept: 'application/json' },
        conditional: false,
      });
      requestCount += 1;
      if (response.notModified) continue;
      pagesFetched += 1;
      const overview = parseApplicationOverview(response.body);
      if (overview === null) {
        context.log('applications.unreadable', { reference: listing.sourceRef });
        continue;
      }
      if (overview.rented) rentedRefs.push(listing.sourceRef);
      if (overview.applications !== null) {
        statusOf.set(listing.sourceRef, overview.applications);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.log('applications.check_failed', { reference: listing.sourceRef, error: message });
      if (message.includes('429')) {
        rateLimited = true;
        break;
      }
      // 403 : l'API ferme la porte, inutile d'insister annonce par annonce.
      if (message.includes('refusé')) break;
    }
  }

  const withStatus = listings.map((listing) => {
    const status = statusOf.get(listing.sourceRef);
    return status === undefined
      ? listing
      : { ...listing, extra: { ...(listing.extra ?? {}), applicationStatus: status } };
  });

  return { listings: withStatus, rentedRefs, requestCount, pagesFetched, rateLimited };
}

/** Coordonnées des agences, par numéro. L'échec n'est pas bloquant (§69). */
async function fetchAgencies(context: ScrapeContext): Promise<{
  agencies: Map<string, { name: string; phone?: string; email?: string }>;
  requestCount: number;
}> {
  let agencies = new Map<string, { name: string; phone?: string; email?: string }>();
  let requestCount = 0;
  try {
    const page = await context.fetch(AGENCIES_URL);
    requestCount += 1;
    if (!page.notModified) agencies = parseAgencies(page.body);
    context.log('agencies.parsed', { agencies: agencies.size });
  } catch (error) {
    context.log('agencies.failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { agencies, requestCount };
}

function stopReasonOf(message: string): StopReason {
  if (message.includes('429')) return 'rateLimited';
  if (message.includes('refusé')) return 'blocked';
  return 'tooManyErrors';
}

/** Lit toutes les pages de la liste, en suivant `<link rel="next">`. */
async function fetchListPages(context: ScrapeContext): Promise<{
  listings: RawListing[];
  agencyOf: Map<string, string>;
  requestCount: number;
  pagesFetched: number;
  stopReason: StopReason;
  complete: boolean;
  warnings: string[];
}> {
  const byReference = new Map<string, RawListing>();
  const agencyOf = new Map<string, string>();
  const warnings: string[] = [];
  let requestCount = 0;
  let pagesFetched = 0;
  let stopReason: StopReason = 'completed';
  let complete = false;
  let total: number | null = null;
  let url: string | null = ENTRY_URL;

  for (let page = 1; url !== null; page += 1) {
    if (page > MAX_LIST_PAGES || context.shouldStop()) {
      stopReason = 'maxPages';
      warnings.push(`Liste Foncia tronquée après ${page - 1} pages`);
      break;
    }
    try {
      // Non conditionnelle : chaque annonce doit repasser pour que son état de
      // candidature soit relu, et le numéro d'agence n'est que dans la page.
      const response = await context.fetch(url, { conditional: false });
      requestCount += 1;
      if (response.notModified) {
        stopReason = 'notModified';
        break;
      }
      pagesFetched += 1;
      const parsed = parseSearchPage(response.body, url);
      if (page === 1) warnings.push(...parsed.warnings);
      total ??= parsed.total;
      for (const listing of parsed.listings) {
        if (!byReference.has(listing.sourceRef)) byReference.set(listing.sourceRef, listing);
      }
      for (const [reference, agency] of parseAgencyByReference(response.body)) {
        if (!agencyOf.has(reference)) agencyOf.set(reference, agency);
      }
      context.log('page.parsed', { url, found: parsed.listings.length, total: parsed.total });
      if (parsed.listings.length === 0) {
        complete = true;
        break;
      }
      url = parsed.nextPageUrl;
      if (url === null) complete = true;
    } catch (error) {
      // §69 : échec propre, les autres sources continuent.
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec sur ${url} : ${message}`);
      context.log('page.failed', { url, error: message });
      stopReason = stopReasonOf(message);
      break;
    }
  }

  if (complete && total !== null && byReference.size < total) {
    warnings.push(`Foncia annonce ${total} annonces, ${byReference.size} lues`);
  }

  return {
    listings: [...byReference.values()],
    agencyOf,
    requestCount,
    pagesFetched,
    stopReason,
    complete,
    warnings,
  };
}

export const fonciaScraper: Scraper = {
  descriptor: FONCIA_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const list = await fetchListPages(context);
    const warnings = [...list.warnings];
    const rentedRefs: string[] = [];
    let { requestCount, pagesFetched, stopReason } = list;

    if (list.listings.length === 0) {
      return {
        sourceId: FONCIA_DESCRIPTOR.id,
        listings: [],
        rentedRefs,
        requestCount,
        pagesFetched,
        stopReason,
        warnings,
      };
    }

    // Coordonnées des agences : le formulaire web devient un e-mail direct.
    const { agencies, requestCount: agencyRequests } = await fetchAgencies(context);
    requestCount += agencyRequests;
    const listings = list.listings.map((listing) => {
      const agency = agencies.get(list.agencyOf.get(listing.sourceRef) ?? '');
      return agency === undefined
        ? listing
        : {
            ...listing,
            agencyName: agency.name,
            ...(agency.phone !== undefined ? { phoneText: agency.phone } : {}),
            ...(agency.email !== undefined ? { emailText: agency.email } : {}),
          };
    });

    // Ce qu'on connaissait et qui n'est plus listé : on le demande à la fiche.
    // Seulement sur une liste lue en entier, sinon « disparue » ne veut rien dire.
    const seen = new Set(listings.map((listing) => listing.sourceRef));
    const vanished = list.complete
      ? [...context.knownRefs].filter((reference) => !seen.has(reference))
      : [];
    const withdrawn = await checkWithdrawn(context, vanished);
    requestCount += withdrawn.requestCount;
    pagesFetched += withdrawn.pagesFetched;
    rentedRefs.push(...withdrawn.rentedRefs);

    let checked = listings;
    let full = 0;
    let rateLimited = withdrawn.rateLimited;
    if (!rateLimited) {
      const applications = await checkApplications(context, listings, list.agencyOf);
      requestCount += applications.requestCount;
      pagesFetched += applications.pagesFetched;
      rentedRefs.push(...applications.rentedRefs);
      checked = applications.listings;
      full = checked.filter((l) => l.extra?.['applicationStatus'] === 'full').length;
      rateLimited = applications.rateLimited;
    }

    // Après un 429, toute requête attendrait la fin du cooldown : on s'arrête.
    let result: readonly RawListing[] = checked;
    if (rateLimited) {
      stopReason = 'rateLimited';
    } else {
      const enriched = await enrichNewListings(context, checked, {
        max: MAX_DETAILS,
        detailUrl: (listing) => listing.sourceUrl,
        parse: (html, listing) => parseDetail(html, listing.sourceRef),
      });
      result = enriched.listings;
      requestCount += enriched.requestCount;
      pagesFetched += enriched.pagesFetched;
      warnings.push(...enriched.warnings);
    }

    context.log('run.summary', {
      found: listings.length,
      vanished: vanished.length,
      withdrawn: withdrawn.rentedRefs.length,
      applicationsFull: full,
    });

    return {
      sourceId: FONCIA_DESCRIPTOR.id,
      listings: result,
      rentedRefs,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
