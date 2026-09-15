/**
 * Source : Laforêt (réseau d'agences).
 *
 * POURQUOI CETTE SOURCE EN PREMIER — voir `docs/sources.md` pour l'étude complète.
 *
 *   - Son `robots.txt` n'interdit que `/louer/rechercher?*` ; les pages
 *     `/ville/location-appartement-{ville}-{cp}` utilisées ici sont autorisées.
 *   - Il déclare explicitement `Allow: /` pour les agents d'IA identifiés, ce
 *     qui traduit une tolérance ouverte à l'accès automatisé identifié (§10).
 *   - Les pages listent aussi les agences voisines, donc une seule requête
 *     couvre Nice et sa périphérie — excellent rapport information/requête (§6).
 *   - Étant un réseau d'agences, il publie des biens parfois absents des grands
 *     portails, ce qui est précisément l'objectif du projet (§3).
 *
 * LES FICHES des annonces nouvelles sont lues ensuite : seules elles portent la
 * description, que la page de ville ne donne pas du tout.
 *
 * CONFORMITÉ. Le scraper n'émet aucune requête vers une page interdite et
 * s'arrête au premier 429. Le téléphone retenu est le lien `tel:` du bouton
 * « Appeler l'agence », écrit dans la page : aucun appel pour le dévoiler.
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
import { parseDetailPage, parseDpeSvg, parseSearchPage } from './parser.js';

/**
 * Codes postaux couverts. Nice s'étend sur quatre codes ; les interroger tous
 * coûte quatre requêtes mais garantit de ne rater aucun quartier.
 */
const NICE_POSTAL_CODES = ['06000', '06100', '06200', '06300'] as const;

const BASE_URL = 'https://www.laforet.com/ville/location-appartement-nice';

/** Une page par code postal, plus une éventuelle page 2. */
const MAX_LIST_PAGES = 6;

/**
 * Fiches lues par passage, pour la description : la page de ville n'en porte
 * aucune. Une trentaine d'annonces en stock se complètent en quelques cycles.
 */
const MAX_DETAILS = 6;

/** Étiquettes DPE lues par passage : une requête chacune, une fois par annonce. */
const MAX_DPE_LABELS = 6;

export const LAFORET_DESCRIPTOR: SourceDescriptor = {
  id: 'laforet',
  name: 'Laforêt',
  domain: 'laforet.com',
  kind: 'agencyNetwork',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('agencyNetwork', { baseIntervalMinutes: 45 }),
  budget: budgetFor('agencyNetwork', {
    maxPagesPerRun: MAX_LIST_PAGES + MAX_DETAILS + MAX_DPE_LABELS,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  allowedPaths: [
    '/ville/location-appartement-*',
    '/agence-immobiliere/*/louer/*',
    '/ajax/properties/*/dpe',
  ],
  notes:
    'robots.txt vérifié le 2026-08-14 : seul /louer/rechercher?* est interdit, ' +
    "les pages /ville/* sont autorisées et la pagination ?page=N l'est également. " +
    'Revérifié le 2026-09-14 : les fiches /agence-immobiliere/*/louer/* sont ' +
    'ouvertes (seuls leurs /bien/*/pdf, mentions légales et formulaires sont fermés). ' +
    'Relu le 2026-09-15 : l’étiquette DPE /ajax/properties/{id}/dpe est ouverte. ' +
    'Les pages incluent les agences voisines (Cagnes, Beausoleil, Cannes) : le ' +
    'filtrage sur la ville est assuré par le scoring, pas par le scraper.',
};

/**
 * Nombre d'annonces déjà connues, au-delà duquel on cesse de paginer.
 *
 * §9 : quand une page ne contient presque que du déjà-vu, on est descendu assez
 * loin dans l'historique. Continuer coûterait des requêtes pour rien.
 */
const KNOWN_RATIO_STOP = 0.8;

export const laforetScraper: Scraper = {
  descriptor: LAFORET_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const warnings: string[] = [];
    const seenRefs = new Set<string>();
    let pagesFetched = 0;
    let requestCount = 0;
    let stopReason: StopReason = 'completed';

    // En mode `live`, une seule page par code postal suffit : les annonces
    // récentes remontent en tête. Le backfill seul justifie d'aller plus loin (§8).
    const maxPagesPerCode = context.mode === 'backfill' ? 3 : 1;

    outer: for (const postalCode of NICE_POSTAL_CODES) {
      for (let page = 1; page <= maxPagesPerCode; page += 1) {
        // La liste s'arrête à sa part du budget : le reste revient aux fiches.
        if (context.shouldStop() || requestCount >= MAX_LIST_PAGES) {
          stopReason = 'maxPages';
          break outer;
        }

        const url =
          page === 1 ? `${BASE_URL}-${postalCode}` : `${BASE_URL}-${postalCode}?page=${page}`;

        let html: string;
        try {
          const response = await context.fetch(url);
          requestCount += 1;

          if (response.notModified) {
            // §30 : rien n'a changé depuis la dernière visite, on passe au
            // code postal suivant sans même analyser la page.
            context.log('page.not_modified', { url });
            break;
          }
          html = response.body;
        } catch (error) {
          // §69 : l'échec d'une page ne fait pas échouer la source entière.
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Échec sur ${url} : ${message}`);
          context.log('page.failed', { url, error: message });
          // Un refus ou une limitation concerne tout le domaine : inutile
          // d'insister sur les autres codes postaux.
          if (message.includes('429') || message.includes('refusé')) {
            stopReason = message.includes('429') ? 'rateLimited' : 'blocked';
            break outer;
          }
          continue;
        }

        pagesFetched += 1;
        const parsed = parseSearchPage(html, url);
        warnings.push(...parsed.warnings);

        let knownOnPage = 0;
        for (const listing of parsed.listings) {
          if (seenRefs.has(listing.sourceRef)) continue;
          seenRefs.add(listing.sourceRef);

          if (context.isKnown(listing.sourceRef)) knownOnPage += 1;
          listings.push(listing);
        }

        context.log('page.parsed', {
          url,
          found: parsed.listings.length,
          known: knownOnPage,
          total: listings.length,
        });

        if (listings.length >= LAFORET_DESCRIPTOR.budget.maxListingsPerRun) {
          stopReason = 'maxListings';
          break outer;
        }

        // §9 : arrêt anticipé en terrain connu.
        const ratio = parsed.listings.length === 0 ? 1 : knownOnPage / parsed.listings.length;
        if (ratio >= KNOWN_RATIO_STOP) {
          context.log('page.known_territory', { url, ratio: Math.round(ratio * 100) });
          stopReason = 'knownTerritory';
          break;
        }

        if (!parsed.hasNextPage) break;
      }
    }

    const enriched = await enrichNewListings(context, listings, {
      max: MAX_DETAILS,
      detailUrl: (listing) => listing.sourceUrl,
      parse: (html) => parseDetailPage(html),
    });
    warnings.push(...enriched.warnings);

    const labelled = await withDpeLabels(context, enriched.listings);
    warnings.push(...labelled.warnings);

    return {
      sourceId: LAFORET_DESCRIPTOR.id,
      listings: labelled.listings,
      requestCount: requestCount + enriched.requestCount + labelled.requestCount,
      pagesFetched: pagesFetched + enriched.pagesFetched + labelled.requestCount,
      stopReason,
      warnings,
    };
  },
};

/** Valeur mémorisée quand l'étiquette ne dit rien : on ne la redemande pas. */
const NO_DPE = 'inconnu';

/** Champs que la fiche apprend, recopiés dans la mémoire avec le DPE. */
const DETAIL_KEYS = [
  'description',
  'chargesText',
  'depositText',
  'feesText',
  'phoneText',
  'emailText',
] as const;

/**
 * LE DPE N'EST PAS DANS LA FICHE, mais dans une image à part : un SVG servi
 * par `/ajax/properties/{id}/dpe`, dont le groupe racine porte la classe. On ne
 * la demande que pour les annonces dont la fiche a été lue, une fois : le
 * résultat rejoint la mémoire des fiches, et un échec réseau réessaie plus tard.
 */
async function withDpeLabels(
  context: ScrapeContext,
  listings: readonly RawListing[],
): Promise<{ listings: RawListing[]; requestCount: number; warnings: string[] }> {
  const warnings: string[] = [];
  const learned = new Map<string, string>();
  const pending = listings.filter(
    (listing) => listing.description !== undefined && listing.extra?.['dpe'] === undefined,
  );
  let requestCount = 0;
  for (const listing of pending.slice(0, MAX_DPE_LABELS)) {
    if (context.shouldStop()) break;
    const url = `https://www.laforet.com/ajax/properties/${listing.sourceRef}/dpe`;
    try {
      const response = await context.fetch(url, { conditional: false });
      requestCount += 1;
      learned.set(listing.sourceRef, parseDpeSvg(response.body) ?? NO_DPE);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.log('dpe.failed', { url, error: message });
      if (message.includes('429')) break;
    }
  }

  const updated = listings.map((listing) => {
    const dpe = learned.get(listing.sourceRef);
    return dpe === undefined ? listing : { ...listing, extra: { ...listing.extra, dpe } };
  });

  const entries = updated
    .filter((listing) => learned.has(listing.sourceRef))
    .map((listing) => {
      const draft: Record<string, unknown> = { extra: { dpe: listing.extra?.['dpe'] } };
      for (const key of DETAIL_KEYS) if (listing[key] !== undefined) draft[key] = listing[key];
      return { sourceRef: listing.sourceRef, draft: draft as Partial<RawListing> };
    });
  if (entries.length > 0) {
    try {
      await context.detailMemory.save(entries);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Mémoire des étiquettes DPE non enregistrée (${entries.length}) : ${message}`);
    }
  }
  return { listings: updated, requestCount, warnings };
}
