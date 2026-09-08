/**
 * Source : Bien'ici — voir l'étude complète en tête de `parser.ts` et dans
 * `docs/sources.md`. Collecte par l'API de recherche du site, en GET, six
 * pages de cent annonces pour couvrir Nice.
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
import { buildSearchUrl, NICE_ZONE_ID, PAGE_SIZE, parseSearchResponse } from './parser.js';

/** Six pages de cent couvrent les ~512 locations niçoises, avec de la marge. */
const MAX_PAGES = 8;

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
    maxPagesPerRun: MAX_PAGES,
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
  // Le contact passe par la fiche du portail, qui présente le formulaire de
  // l'agence : automatiser n'est pas approprié (§23).
  manualOnly: true,
  allowedPaths: ['/realEstateAds.json'],
  notes:
    'API de recherche du site (GET realEstateAds.json?filters=…), vérifiée le ' +
    '2026-09-08. robots.txt relu le même jour : ni ce chemin ni nos paramètres ' +
    'n’y figurent. Zone Nice = -170100 (via suggest.json). Prix charges ' +
    'comprises. Position publiée seulement quand blurInfo la déclare exacte ou ' +
    'floutée à 100 m au plus — au-delà, le site ne situe que la commune.',
};

export const bieniciScraper: Scraper = {
  descriptor: BIENICI_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (context.shouldStop()) {
        stopReason = 'maxPages';
        break;
      }

      try {
        const response = await context.fetch(buildSearchUrl(NICE_ZONE_ID, page), {
          headers: { accept: 'application/json' },
        });
        requestCount += 1;
        if (response.notModified) continue;
        pagesFetched += 1;

        const parsed = parseSearchResponse(response.body);
        warnings.push(...parsed.warnings);
        for (const listing of parsed.listings) listings.push(listing);
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

    return {
      sourceId: BIENICI_DESCRIPTOR.id,
      listings,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
