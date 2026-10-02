/**
 * Source : Immobilière Pujol. Voir `parser.ts` et `docs/sources-enquetes.md`.
 *
 * COLLECTE PAR PLAN DE SITE. Cinq fichiers énumèrent 4 681 annonces, dont
 * dix-huit à Nice — l'agence est marseillaise. On ne visite que celles-là, et
 * seulement les nouvelles : cinq requêtes par passage en régime établi.
 *
 * ON GARDE LES ANNONCES CLÔTURÉES, et c'est l'intérêt principal. Seize des
 * dix-huit portent le bandeau « Ce bien a été loué » avec le loyer réellement
 * obtenu, à une adresse exacte. Marquées louées, elles sortent de la liste de
 * recherche mais nourrissent les statistiques et le repère de prix — partout
 * ailleurs, le projet ne voit que des loyers DEMANDÉS.
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
import { niceListingUrls, parseDetail, referenceOf, SITEMAPS } from './parser.js';

/**
 * Fiches visitées par exécution, pour les annonces NOUVELLES seulement.
 *
 * Dix-huit annonces niçoises en tout : une première collecte les couvre d'un
 * seul passage, et il n'en paraît ensuite qu'une de loin en loin.
 */
const MAX_DETAILS = 20;

/**
 * Fiches CONNUES relues par exécution, pour voir lesquelles se sont fermées.
 *
 * SANS CE RELU, UNE ANNONCE LOUÉE RESTE ACTIVE INDÉFINIMENT. Le bandeau
 * « Location clôturée » n'apparaît qu'après la signature du bail : une fiche
 * lue la veille est donc encore ouverte en base, et comme elle ne reparait plus
 * dans les plans de site — il n'y a que les mêmes URL, dédupliquées —, plus
 * rien ne la revisitait. Le bandeau était bien détecté, jamais relu.
 *
 * Les plus anciennes lectures d'abord, pour qu'un stock minuscule soit couvert
 * entièrement en quelques passages.
 */
const MAX_RECHECKS = 4;

/** Une fiche relue ne l'est pas avant un jour — le bail ne se signe pas en heure. */
const RECHECK_AFTER_MS = 24 * 60 * 60 * 1000;

export const PUJOL_DESCRIPTOR: SourceDescriptor = {
  id: 'pujol',
  name: 'Immobilière Pujol',
  domain: 'immobiliere-pujol.fr',
  // Une seule agence, à Marseille, qui gère aussi les biens niçois : coordonnées
  // de son JSON-LD RealEstateAgent (relevé du 2026-09-15).
  agencyContact: {
    phone: '04 91 37 38 39', // secret-scan-ignore
    email: 'contact@immobiliere-pujol.fr', // secret-scan-ignore
    address: { street: '7 rue du Dr Fiolle', postalCode: '13006', city: 'Marseille' },
  },
  kind: 'localAgency',
  method: 'sitemap',
  // Volume minuscule, mais des adresses exactes et des loyers obtenus.
  priority: 3,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', {
    maxPagesPerRun: SITEMAPS.length + MAX_DETAILS + MAX_RECHECKS,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  allowedPaths: ['/ads-sitemap*.xml', '/annonces/*'],
  notes:
    'robots.txt vérifié le 2026-09-09 : « Allow: / », plan de site déclaré. ' +
    '4 681 annonces dont 18 à Nice, l’agence étant marseillaise. Seize sont ' +
    'clôturées et portent le loyer obtenu à une adresse exacte — conservées ' +
    'comme louées. ATTENTION : le titre du site annonce « Marseille » sur des ' +
    'biens niçois ; la ville ne se lit jamais là, mais dans l’adresse de la fiche.',
};

/** Ce qu'une relecture a appris, et ce qu'elle a coûté. */
interface RecheckReport {
  readonly listings: readonly RawListing[];
  readonly rentedRefs: readonly string[];
  readonly requestCount: number;
  readonly pagesFetched: number;
  /** `true` si un 429 a interrompu la relecture. */
  readonly rateLimited: boolean;
}

/**
 * Relit quelques fiches CONNUES, les moins récemment lues d'abord.
 *
 * Une référence connue n'est plus visitée par le parcours normal : sans ce
 * relu, une fiche passée en cours de location avant que le bandeau « Location
 * clôturée » n'apparaisse y resterait active indéfiniment.
 */
async function recheckKnown(
  context: ScrapeContext,
  urls: ReadonlySet<string>,
): Promise<RecheckReport> {
  const listings: RawListing[] = [];
  const rentedRefs: string[] = [];
  const nowMs = Date.now();
  const due = [...context.knownRefs]
    .map((reference) => ({
      url: [...urls].find((candidate) => referenceOf(candidate) === reference),
      at: Date.parse(context.detailMemory.get(reference)?.fetchedAt ?? ''),
    }))
    .filter((entry) => entry.url !== undefined)
    // Une mémoire absente ou illisible passe en premier : on ignore l'horodatage
    // qu'on n'a pas plutôt que de ne jamais relire.
    .filter((entry) => !Number.isFinite(entry.at) || nowMs - entry.at >= RECHECK_AFTER_MS)
    .sort((a, b) => a.at - b.at);

  let requestCount = 0;
  let pagesFetched = 0;
  for (const entry of due) {
    if (listings.length >= MAX_RECHECKS || context.shouldStop()) break;
    try {
      const page = await context.fetch(entry.url as string);
      requestCount += 1;
      if (page.notModified) continue;
      pagesFetched += 1;
      const parsed = parseDetail(page.body, entry.url as string);
      if (parsed === null) continue;
      listings.push(parsed.listing);
      // Ferme, elle devient une donnée de prix : le loyer réellement obtenu.
      if (parsed.closed) rentedRefs.push(parsed.listing.sourceRef);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.log('recheck.failed', { url: entry.url, error: message });
      if (message.includes('429')) {
        return { listings, rentedRefs, requestCount, pagesFetched, rateLimited: true };
      }
    }
  }

  return { listings, rentedRefs, requestCount, pagesFetched, rateLimited: false };
}

export const pujolScraper: Scraper = {
  descriptor: PUJOL_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const rentedRefs: string[] = [];
    /** Les fiches vues mais déjà connues : sans elles, la source paraît morte. */
    const confirmedRefs: string[] = [];
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    // 1. Les plans de site, pour ne retenir que Nice.
    const urls = new Set<string>();
    for (const sitemap of SITEMAPS) {
      if (context.shouldStop()) break;
      try {
        const response = await context.fetch(sitemap);
        requestCount += 1;
        if (response.notModified) continue;
        pagesFetched += 1;
        for (const url of niceListingUrls(response.body)) urls.add(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Plan de site injoignable : ${sitemap}`);
        context.log('sitemap.failed', { url: sitemap, error: message });
        if (message.includes('429')) {
          stopReason = 'rateLimited';
          break;
        }
      }
    }
    context.log('sitemap.parsed', { nice: urls.size });
    if (urls.size === 0 && pagesFetched > 0) {
      warnings.push('Aucune annonce niçoise dans les plans de site — gabarit modifié ?');
    }

    // 2. Les fiches nouvelles seulement, hors rattrapage : une annonce clôturée
    // ne change plus.
    let budget = MAX_DETAILS;
    for (const url of urls) {
      if (budget <= 0 || context.shouldStop()) {
        stopReason = 'maxPages';
        break;
      }
      const reference = referenceOf(url);
      if (reference === null) continue;
      // En rattrapage, on relit aussi les connues : celles collectées avant la
      // lecture du texte complet gardent sinon leur description tronquée.
      if (context.isKnown(reference) && context.mode !== 'backfill') {
        confirmedRefs.push(reference);
        continue;
      }
      budget -= 1;

      try {
        const page = await context.fetch(url);
        requestCount += 1;
        if (page.notModified) continue;
        pagesFetched += 1;
        const parsed = parseDetail(page.body, url);
        if (parsed === null) continue;
        listings.push(parsed.listing);
        if (parsed.closed) rentedRefs.push(parsed.listing.sourceRef);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.log('detail.failed', { url, error: message });
        warnings.push(`Fiche injoignable : ${url}`);
        if (message.includes('429')) {
          stopReason = 'rateLimited';
          break;
        }
      }
    }

    // 3. Les fiches CONNUES, relues : c'est là, et nulle part ailleurs, qu'un
    //    bandeau « Location clôturée » apparaît.
    const relecture = await recheckKnown(context, urls);
    listings.push(...relecture.listings);
    rentedRefs.push(...relecture.rentedRefs);
    requestCount += relecture.requestCount;
    pagesFetched += relecture.pagesFetched;
    if (relecture.rateLimited) stopReason = 'rateLimited';

    return {
      sourceId: PUJOL_DESCRIPTOR.id,
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
