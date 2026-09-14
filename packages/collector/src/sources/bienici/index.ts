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
import { enrichNewListings } from '../shared/enrich.js';
import {
  buildDetailUrl,
  buildSearchUrl,
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
    maxPagesPerRun: MAX_PAGES + MAX_DETAILS,
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
    'non listé, aucune protection) : agence et téléphone des comptes pro.',
};

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

    return {
      sourceId: BIENICI_DESCRIPTOR.id,
      listings: enriched.listings,
      confirmedRefs,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
