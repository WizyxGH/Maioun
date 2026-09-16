/**
 * Source : Bien'ici — voir l'étude complète en tête de `parser.ts` et dans
 * `docs/sources.md`. Collecte par l'API de recherche du site, en GET, six
 * pages de cent annonces pour couvrir Nice, puis la fiche JSON des annonces
 * dont on ne connaît pas encore l'agence et son téléphone.
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
import { enrichNewListings, REJECTED_DRAFT } from '../shared/enrich.js';
import type { RawDraft } from '../shared/raw-listing.js';
import {
  buildDetailUrl,
  buildSearchUrl,
  isWithdrawnDraft,
  NICE_ZONE_ID,
  PAGE_SIZE,
  parseAdDetail,
  parseSearchResponse,
} from './parser.js';

/** Six pages de cent couvrent les ~512 locations niçoises, avec de la marge. */
const MAX_PAGES = 8;

/**
 * Fiches lues par passage. Une fiche lue est gardée une semaine : le stock
 * (~520) se complète en une vingtaine de passages, puis seules les parutions
 * et les relectures hebdomadaires coûtent une requête.
 */
const MAX_DETAILS = 30;

/**
 * Fiches de vérification par passage : les annonces que la liste portait au
 * passage précédent et ne porte plus. Une dizaine de départs par jour, donc
 * la marge est large.
 */
const MAX_WITHDRAWN_CHECKS = 8;

export const BIENICI_DESCRIPTOR: SourceDescriptor = {
  id: 'bienici',
  name: 'Bien’ici',
  domain: 'bienici.com',
  kind: 'portal',
  method: 'officialApi',
  // Volume et richesse hors norme pour le projet : c'est la source qui réduit
  // le plus la dépendance aux alertes e-mail.
  priority: 1,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', {
    maxPagesPerRun: MAX_PAGES + MAX_DETAILS + MAX_WITHDRAWN_CHECKS,
    maxListingsPerRun: 1000,
    delayBetweenRequestsMs: 2_000,
  }),
  enabled: true,
  /**
   * LE PORTAIL RELAIE, il ne publie pas. Deux annonces Bien'ici qui partagent
   * une photo sont le même bien vu deux fois — souvent parce que deux agences
   * le commercialisent. Le signal vaut ici, contrairement à un site d'agence
   * où le même cliché tamponné illustre vingt biens (§14).
   */
  relaysListings: true,
  allowedPaths: ['/realEstateAds.json', '/realEstateAd.json'],
  notes:
    'API de recherche du site (GET realEstateAds.json?filters=…), vérifiée le ' +
    '2026-09-08. robots.txt relu le même jour : ni ce chemin ni nos paramètres ' +
    'n’y figurent. Zone Nice = -170100 (via suggest.json). Prix charges ' +
    'comprises. Position publiée seulement quand blurInfo la déclare exacte ou ' +
    'floutée à 100 m au plus — au-delà, le site ne situe que la commune. ' +
    'Fiche JSON realEstateAd.json?id=… (robots.txt relu le 2026-09-14, chemin ' +
    'non listé, aucune protection) : agence et téléphone des comptes pro, et ' +
    '`status.onTheMarket: false` pour une annonce retirée — la page HTML, elle, ' +
    'est la même coquille en ligne ou retirée. Code postal pris sur le quartier ' +
    'quand le portail en nomme un : `postalCode` vaut souvent celui de la commune.',
};

/**
 * Va DEMANDER au portail ce que sont devenues les annonces qui viennent de
 * quitter la liste.
 *
 * POURQUOI LA DEMANDE VAUT LE DÉTOUR. La recherche ne rend que ce qui est en
 * vente (`onTheMarket`) : une annonce retirée n'en disparaît pas autrement
 * qu'une annonce poussée en page suivante. Sans vérification, elle attend le
 * seuil d'absences avant de s'éteindre, et reste affichée entre-temps — c'est
 * ce qu'on nous a signalé, fiche Bien'ici barrée d'un « n'est plus disponible »
 * et toujours visible chez nous. La fiche JSON, elle, tranche en une requête.
 *
 * QUI VÉRIFIER : celles que les pages lues portaient LA FOIS PRÉCÉDENTE et ne
 * portent plus. Ce voisinage vaut mieux que l'inventaire complet de la base —
 * il ne contient que des départs du jour, là où les références connues traînent
 * des centaines d'annonces éteintes depuis longtemps. Celles déjà notées
 * retirées ne se revérifient jamais.
 */
async function checkVanished(
  context: ScrapeContext,
  previousRefs: ReadonlySet<string>,
  seen: ReadonlySet<string>,
): Promise<{ withdrawn: string[]; requestCount: number; pagesFetched: number }> {
  const due = [...previousRefs]
    .filter((reference) => !seen.has(reference))
    .filter((reference) => !isWithdrawnDraft(context.detailMemory.get(reference)?.draft))
    .slice(0, MAX_WITHDRAWN_CHECKS);

  const withdrawn: string[] = [];
  const learned: { sourceRef: string; draft: RawDraft }[] = [];
  let requestCount = 0;
  let pagesFetched = 0;
  for (const reference of due) {
    if (context.shouldStop()) break;
    const previous = context.detailMemory.get(reference)?.draft;
    try {
      const page = await context.fetch(buildDetailUrl(reference), {
        headers: { accept: 'application/json' },
      });
      requestCount += 1;
      if (page.notModified) {
        // Fiche inchangée : ce que la mémoire en garde reste vrai, et rajeunit.
        if (previous !== undefined) learned.push({ sourceRef: reference, draft: previous });
        continue;
      }
      pagesFetched += 1;
      const draft = parseAdDetail(page.body);
      if (draft !== null && isWithdrawnDraft(draft)) withdrawn.push(reference);
      learned.push({ sourceRef: reference, draft: draft ?? previous ?? REJECTED_DRAFT });
    } catch (error) {
      // Une fiche injoignable ne prouve rien : l'annonce reste en l'état.
      const message = error instanceof Error ? error.message : String(error);
      context.log('withdrawn.check_failed', { reference, error: message });
      if (message.includes('429')) break;
    }
  }

  if (learned.length > 0) {
    try {
      await context.detailMemory.save(learned);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.log('detail.memory_failed', { count: learned.length, error: message });
    }
  }
  return { withdrawn, requestCount, pagesFetched };
}

export const bieniciScraper: Scraper = {
  descriptor: BIENICI_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    /** Les annonces des pages INCHANGÉES : toujours en ligne, pas retéléchargées. */
    const confirmedRefs: string[] = [];
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';
    /** Une page 304 dont on ne sait pas ce qu'elle portait : l'inventaire est incomplet. */
    let pageInconnue = false;
    /** Ce que les pages lues portaient au passage précédent : les partantes s'y lisent. */
    const previousRefs = new Set<string>();

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (context.shouldStop()) {
        stopReason = 'maxPages';
        break;
      }

      try {
        const url = buildSearchUrl(NICE_ZONE_ID, page);
        const response = await context.fetch(url, { headers: { accept: 'application/json' } });
        requestCount += 1;

        /**
         * UNE PAGE INCHANGÉE N'EST PAS UNE PAGE VIDE.
         *
         * Bien'ici répond 304 à plus de la moitié des requêtes — mesuré le
         * 2026-09-10 : 191 sur 340 en deux jours. On `continue`-ait sans rien
         * compter : un passage entièrement inchangé rendait « 0 annonce » pour
         * 510 en ligne, et un passage à moitié inchangé comptait l'autre moitié
         * comme ABSENTE. On relit donc ce que la page portait, et ses annonces
         * valent confirmation.
         */
        if (response.notModified) {
          const refs = await context.pageRefs.get(url);
          if (refs === null) {
            // Jamais téléchargée avec la mémoire : on ne sait pas ce qu'elle
            // porte, et on ne l'invente pas.
            pageInconnue = true;
            continue;
          }
          confirmedRefs.push(...refs);
          // Une page qui portait moins d'une page pleine était la dernière.
          if (refs.length < PAGE_SIZE) break;
          continue;
        }
        pagesFetched += 1;

        const parsed = parseSearchResponse(response.body);
        warnings.push(...parsed.warnings);
        listings.push(...parsed.listings);
        // Avant de l'écraser : ce que cette page portait la fois d'avant.
        for (const reference of (await context.pageRefs.get(url)) ?? [])
          previousRefs.add(reference);
        await context.pageRefs.set(
          url,
          parsed.listings.map((listing) => listing.sourceRef),
        );
        context.log('api.parsed', { page, found: parsed.listings.length, total: parsed.total });

        // UNE PAGE INCOMPLÈTE EST LA DERNIÈRE. On s'arrête sur ce que la
        // réponse montre, sans redemander une page qu'on sait vide.
        if (parsed.listings.length < PAGE_SIZE) break;
        if (parsed.total !== null && page * PAGE_SIZE >= parsed.total) break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Échec Bien’ici (page ${page}) : ${message}`);
        context.log('api.failed', { page, error: message });
        if (message.includes('429')) {
          stopReason = 'rateLimited';
          break;
        }
        // §69 : une page en échec n'annule pas les précédentes.
        stopReason = 'tooManyErrors';
        break;
      }
    }

    // Les fiches APRÈS la pagination, pour ne pas lui prendre son budget ; et
    // aucune après un 429 — la mémoire s'applique quand même, sans requête.
    const enriched = await enrichNewListings(context, listings, {
      max: stopReason === 'rateLimited' ? 0 : MAX_DETAILS,
      detailUrl: (listing) => buildDetailUrl(listing.sourceRef),
      parse: (body) => parseAdDetail(body),
    });
    requestCount += enriched.requestCount;
    pagesFetched += enriched.pagesFetched;
    warnings.push(...enriched.warnings);

    // UN INVENTAIRE INCOMPLET NE DOIT RIEN RETIRER : une page dont on ignore le
    // contenu fait sauter le cycle de vie de ce passage, plutôt que de compter
    // ses annonces comme disparues.
    if (pageInconnue && stopReason === 'completed') stopReason = 'notModified';

    // Les partantes se lisent sur un inventaire complet : sans lui, une annonce
    // d'une page qu'on n'a pas lue passerait pour disparue.
    const seen = new Set([...confirmedRefs, ...listings.map((listing) => listing.sourceRef)]);
    const checked =
      pageInconnue || stopReason === 'rateLimited'
        ? { withdrawn: [], requestCount: 0, pagesFetched: 0 }
        : await checkVanished(context, previousRefs, seen);
    requestCount += checked.requestCount;
    pagesFetched += checked.pagesFetched;

    // Retirée d'après sa fiche — lue à l'instant ou mémorisée : la liste ne la
    // ramène pas, et le pipeline l'éteint dès cette collecte.
    const withdrawnRefs = [
      ...enriched.listings.filter((listing) => isWithdrawnDraft(listing)).map((l) => l.sourceRef),
      ...checked.withdrawn,
    ];
    if (withdrawnRefs.length > 0) context.log('withdrawn', { count: withdrawnRefs.length });

    return {
      sourceId: BIENICI_DESCRIPTOR.id,
      listings: enriched.listings.filter((listing) => !isWithdrawnDraft(listing)),
      confirmedRefs,
      withdrawnRefs,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
