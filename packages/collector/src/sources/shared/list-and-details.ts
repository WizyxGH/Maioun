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
import { announcedTotal, shortCoverageWarning } from './announced-total.js';
import { enrichNewListings } from './enrich.js';
import type { RawDraft } from './raw-listing.js';
import { withdrawnRefsFrom } from './withdrawn.js';

export interface ListAndDetailsOptions {
  readonly sourceId: string;
  readonly listUrls: readonly string[];
  /** Annonces esquissées depuis une page de liste. */
  readonly parseList: (body: string, url: string) => readonly RawListing[];
  /**
   * Le total que la page de liste ANNONCE, quand le site le publie.
   *
   * Défaut : le lecteur commun, qui reconnaît « 15 annonces trouvées », « 5
   * biens disponibles », « 4 réponses » et le compte porté par le titre de la
   * page. Une source dont le compteur a une forme à elle passe le sien ; une
   * source qui n'en publie aucun rend `null`, et la couverture reste
   * simplement indécidable.
   */
  readonly announcedTotal?: (body: string, url: string) => number | null;
  /**
   * `true` si la page porte le message « aucun résultat » de la plateforme :
   * sans lui, une liste vide passe pour un gabarit cassé.
   */
  readonly isEmptyList?: (body: string) => boolean;
  /**
   * Adresse des données de la fiche, quand ce n'est pas la page de l'annonce
   * (API d'une fiche rendue en JavaScript). Défaut : `sourceUrl`.
   */
  readonly detailUrl?: (listing: RawListing) => string | null;
  /** Ce que la fiche apprend ; `null` si elle n'apprend rien. */
  readonly parseDetail: (html: string, listing: RawListing) => RawDraft | null;
  /** Fiches lues au plus par passage. */
  readonly maxDetails: number;
  /**
   * La page suivante d'une liste PAGINÉE, telle que la page la publie ; `null`
   * à la dernière. Absente : chaque adresse de `listUrls` est une liste entière.
   */
  readonly nextPage?: (body: string, url: string) => string | null;
  /** Pages lues au plus par liste paginée : au-delà, c'est une boucle. */
  readonly maxListPages?: number;
}

/** Plafond par défaut des pages d'une liste paginée. */
const PAGES_DE_LISTE_MAX = 15;

/**
 * Le plus grand des deux totaux annoncés, `null` s'ils le sont tous les deux.
 *
 * Le PLUS GRAND, et non leur somme : sur un site paginé, chaque page annonce le
 * total de la recherche entière et non le sien. Sur un site dont les listes
 * couvrent plusieurs communes, le plus grand sous-total reste en deçà du vrai
 * compte — et se taire vaut mieux que crier à tort.
 */
function larger(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/**
 * LE SITE ANNONCE PLUS QUE CE QUE NOUS AVONS LU : c'est un trou de couverture,
 * et il se dit ici plutôt que d'attendre qu'un utilisateur tombe sur l'annonce
 * manquante ailleurs. Le passage n'en est pas dénaturé pour autant — ce qui a
 * été lu reste bon —, d'où un avertissement et non un changement de verdict.
 *
 * @returns la ligne à consigner, ou `null` si rien ne manque.
 */
function shortOf(announced: number | null, collected: number): string | null {
  if (announced === null || collected >= announced) return null;
  return shortCoverageWarning(announced, collected);
}

/** Ce que la lecture des listes a rassemblé, avant les fiches. */
interface ListesLues {
  readonly stubs: Map<string, RawListing>;
  readonly warnings: string[];
  requestCount: number;
  pagesFetched: number;
  unchanged: number;
  saidEmpty: number;
  listesEnEchec: number;
  /** Ce que les pages de liste disent publier, au plus. */
  announced: number | null;
  /** La source a refusé ou freiné : on s'arrête là. */
  refus: 'rateLimited' | 'blocked' | null;
}

/**
 * Lit une page de liste dans `lues` ; rend l'adresse de la suivante, ou `null`.
 *
 * UNE LISTE PAGINÉE SE LIT EN ENTIER, sans revalidation : une première page
 * « inchangée » ne dit rien des suivantes, et ne pas les lire ferait passer
 * leurs annonces pour retirées.
 */
async function lirePage(
  context: ScrapeContext,
  options: ListAndDetailsOptions,
  url: string,
  lues: ListesLues,
): Promise<string | null> {
  const paginee = options.nextPage !== undefined;
  const readTotal =
    options.announcedTotal ?? ((body: string): number | null => announcedTotal(body));
  try {
    const response = await context.fetch(url, paginee ? { conditional: false } : {});
    lues.requestCount += 1;
    if (response.notModified) {
      lues.unchanged += 1;
      return null;
    }
    lues.pagesFetched += 1;
    const found = options.parseList(response.body, url);
    lues.announced = larger(lues.announced, readTotal(response.body, url));
    for (const stub of found) {
      if (!lues.stubs.has(stub.sourceRef)) lues.stubs.set(stub.sourceRef, stub);
    }
    if (found.length === 0 && options.isEmptyList?.(response.body) === true) lues.saidEmpty += 1;
    // Une page vide clôt la liste, même si elle renvoie plus loin.
    return found.length > 0 ? (options.nextPage?.(response.body, url) ?? null) : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lues.warnings.push(`Échec de la liste ${url} : ${message}`);
    context.log('list.failed', { url, error: message });
    lues.listesEnEchec += 1;
    if (message.includes('429')) lues.refus = 'rateLimited';
    else if (message.includes('refusé')) lues.refus = 'blocked';
    return null;
  }
}

/** Toutes les listes, et leurs pages suivantes quand la source en publie. */
async function lireLesListes(
  context: ScrapeContext,
  options: ListAndDetailsOptions,
): Promise<ListesLues> {
  const lues: ListesLues = {
    stubs: new Map(),
    warnings: [],
    requestCount: 0,
    pagesFetched: 0,
    unchanged: 0,
    saidEmpty: 0,
    listesEnEchec: 0,
    announced: null,
    refus: null,
  };
  const maxPages =
    options.nextPage !== undefined ? (options.maxListPages ?? PAGES_DE_LISTE_MAX) : 1;
  for (const listUrl of options.listUrls) {
    const vues = new Set<string>();
    let url: string | null = listUrl;
    while (url !== null && !vues.has(url) && vues.size < maxPages) {
      vues.add(url);
      url = await lirePage(context, options, url, lues);
      if (lues.refus !== null) return lues;
    }
  }
  return lues;
}

export async function runListAndDetails(
  context: ScrapeContext,
  options: ListAndDetailsOptions,
): Promise<ScrapeResult> {
  const { sourceId } = options;
  const lues = await lireLesListes(context, options);
  const { stubs, warnings, unchanged, saidEmpty, listesEnEchec, announced } = lues;
  let { requestCount, pagesFetched } = lues;
  if (lues.refus !== null) {
    return { sourceId, listings: [], requestCount, pagesFetched, stopReason: lues.refus, warnings };
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
  // Toutes les listes lues ET vides de l'aveu du site : une liste inchangée ou
  // en échec pourrait encore porter des annonces.
  if (stubs.size === 0 && saidEmpty === options.listUrls.length) {
    return { sourceId, listings: [], requestCount, pagesFetched, stopReason: 'empty', warnings };
  }
  if (stubs.size === 0) {
    warnings.push(`Aucune annonce sur la liste : ${options.listUrls[0] ?? ''}`);
    const stopReason = pagesFetched === 0 ? 'tooManyErrors' : 'completed';
    return { sourceId, listings: [], requestCount, pagesFetched, stopReason, warnings };
  }

  const short = shortOf(announced, stubs.size);
  if (short !== null) {
    warnings.push(short);
    context.log('list.short', { announced, collected: stubs.size });
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

  // Une liste en échec laisse l'inventaire lu en partie : ce passage ne conclut
  // rien, pas même sur une fiche demandée une par une.
  const withdrawnRefs = withdrawnRefsFrom(
    context,
    enriched,
    listesEnEchec > 0 ? 'incomplete' : 'completed',
  );
  const parties = new Set(withdrawnRefs);

  const listings = enriched.listings.filter(
    (listing) => listing.priceText !== undefined && !parties.has(listing.sourceRef),
  );
  const rendered = new Set(listings.map((listing) => listing.sourceRef));
  // Une annonce retirée n'est pas une annonce confirmée : sans cette exclusion,
  // la confirmation la remettrait en ligne juste avant qu'on ne l'éteigne.
  const confirmedRefs = all
    .map((stub) => stub.sourceRef)
    .filter((ref) => !rendered.has(ref) && !parties.has(ref) && context.isKnown(ref));

  context.log('list.parsed', {
    found: all.length,
    rendered: listings.length,
    details: enriched.pagesFetched,
  });

  return {
    sourceId,
    listings,
    confirmedRefs,
    withdrawnRefs,
    requestCount,
    pagesFetched,
    stopReason: 'completed',
    warnings,
  };
}
