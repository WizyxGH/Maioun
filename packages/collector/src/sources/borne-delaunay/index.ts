/**
 * Source : Borne & Delaunay — voir l'étude dans `parser.ts`.
 *
 * Agence niçoise (gestion locative, syndic), demandée explicitement. Petit
 * stock — trois locations au relevé du 2026-09-04 — mais c'est le propos :
 * réduire la dépendance aux alertes e-mail des portails, dont proviennent
 * aujourd'hui trois quarts de l'inventaire et qui ne publient aucune adresse.
 *
 * Une requête pour la page de locations, puis la fiche des annonces NOUVELLES :
 * elle seule porte la description.
 */

import type {
  Scraper,
  ScrapeContext,
  ScrapeResult,
  SourceDescriptor,
  StopReason,
} from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { enrichNewListings } from '../shared/enrich.js';
import { withdrawnAfterEnrich } from '../shared/withdrawn.js';
import { parseDetailPage, parseListPage } from './parser.js';
import { stopReasonFromError } from '../shared/stop-reason.js';

const LIST_URL = 'https://www.borne-delaunay.com/immobilier/louer-13';

/** Fiches lues par passage : le stock tient en trois ou quatre annonces. */
const MAX_DETAILS = 5;

export const BORNE_DELAUNAY_DESCRIPTOR: SourceDescriptor = {
  id: 'borne-delaunay',
  name: 'Borne & Delaunay',
  domain: 'borne-delaunay.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS, maxListingsPerRun: 40 }),
  enabled: true,
  allowedPaths: ['/immobilier/louer-*', '/location-*'],
  notes:
    'Agence Nice (gestion locative, syndic). robots.txt vérifié le 2026-09-04 ' +
    'et le 2026-09-14 : seul /contacts/success_landing est interdit. Site Rails ' +
    'maison, rendu côté serveur, sans anti-bot. La page /immobilier/louer-13 porte ' +
    'toutes les locations (titre, ville, CP, type, pièces, surface, loyer, photo) ; ' +
    'la description n’est que sur la fiche /location-*, lue pour les nouvelles.',
};

export const borneDelaunayScraper: Scraper = {
  descriptor: BORNE_DELAUNAY_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    let requestCount = 0;
    let pagesFetched = 0;

    try {
      const response = await context.fetch(LIST_URL);
      requestCount += 1;
      if (response.notModified) {
        return {
          sourceId: BORNE_DELAUNAY_DESCRIPTOR.id,
          listings: [],
          requestCount,
          pagesFetched,
          stopReason: 'notModified',
          warnings: [],
        };
      }
      pagesFetched += 1;

      const parsed = parseListPage(response.body, LIST_URL, BORNE_DELAUNAY_DESCRIPTOR.name);
      context.log('list.parsed', { listings: parsed.listings.length });

      const enriched = await enrichNewListings(context, parsed.listings, {
        max: MAX_DETAILS,
        detailUrl: (listing) => listing.sourceUrl,
        parse: (html) => parseDetailPage(html),
      });

      // Fiches que le site dit absentes : éteintes dès ce passage.
      const restantes = withdrawnAfterEnrich(context, enriched, 'completed');

      return {
        sourceId: BORNE_DELAUNAY_DESCRIPTOR.id,
        listings: restantes.listings,
        withdrawnRefs: restantes.withdrawnRefs,
        requestCount: requestCount + enriched.requestCount,
        pagesFetched: pagesFetched + enriched.pagesFetched,
        stopReason: 'completed',
        warnings: [...parsed.warnings, ...enriched.warnings],
      };
    } catch (error) {
      // §69 : échec propre, les autres sources continuent.
      const message = error instanceof Error ? error.message : String(error);
      context.log('list.failed', { url: LIST_URL, error: message });
      const stopReason: StopReason = stopReasonFromError(message);
      return {
        sourceId: BORNE_DELAUNAY_DESCRIPTOR.id,
        listings: [],
        requestCount,
        pagesFetched,
        stopReason,
        warnings: [`Échec de la liste : ${message}`],
      };
    }
  },
};
