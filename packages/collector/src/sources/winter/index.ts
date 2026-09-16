/**
 * Source : Winter Immobilier (agence-winter.com) — voir l'étude dans `parser.ts`.
 * Page `/louer` en SSR : une requête, puis la fiche des annonces qui en ont
 * besoin — la liste ne porte aucune description.
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
import { withdrawnAfterEnrich } from '../shared/withdrawn.js';
import { parseDetail, parseListPage } from './parser.js';

const LIST_URL = 'https://www.agence-winter.com/louer';

/** Fiches visitées par exécution : le stock tient en une dizaine d'annonces. */
const MAX_DETAILS = 10;

export const WINTER_DESCRIPTOR: SourceDescriptor = {
  id: 'winter',
  name: 'Winter Immobilier',
  domain: 'agence-winter.com',
  // Pas de /favicon.ico ici : le site declare son icone ailleurs (§17).
  logo: 'https://www.agence-winter.com/favicons/favicon.ico',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS, maxListingsPerRun: 40 }),
  enabled: true,
  allowedPaths: ['/louer', '/biens/a-louer-*'],
  notes:
    'Agence Nice, site custom (Rails). robots.txt vérifié le 2026-08-24 : ' +
    'permissif (interdit /admin/, tris, PDF). Page `/louer` SSR : cartes ' +
    'div.anim-fade-up avec ville, titre (pièces/meublé), prix « … €/mois », ' +
    'lien /biens/a-louer-…-{id}. La description ne vit que sur la fiche ' +
    '(.readmore__content), lue pour les nouvelles annonces.',
};

export const winterScraper: Scraper = {
  descriptor: WINTER_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    try {
      const response = await context.fetch(LIST_URL);
      requestCount += 1;
      if (response.notModified) {
        return {
          sourceId: WINTER_DESCRIPTOR.id,
          listings: [],
          requestCount,
          pagesFetched,
          stopReason: 'notModified',
          warnings,
        };
      }
      pagesFetched += 1;
      const parsed = parseListPage(response.body, LIST_URL, WINTER_DESCRIPTOR.name);
      listings.push(...parsed.listings);
      warnings.push(...parsed.warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec de la liste : ${message}`);
      context.log('list.failed', { url: LIST_URL, error: message });
      stopReason = message.includes('429')
        ? 'rateLimited'
        : message.includes('refusé')
          ? 'blocked'
          : 'tooManyErrors';
    }

    // La liste n'a aucune description : la fiche la donne en entier.
    const enriched = await enrichNewListings(context, listings, {
      max: MAX_DETAILS,
      detailUrl: (listing) => listing.sourceUrl ?? null,
      parse: (html) => parseDetail(html),
    });

    // Fiches que le site dit absentes : éteintes dès ce passage.
    const restantes = withdrawnAfterEnrich(context, enriched, stopReason);

    context.log('list.parsed', { listings: restantes.listings.length });
    return {
      sourceId: WINTER_DESCRIPTOR.id,
      listings: restantes.listings,
      withdrawnRefs: restantes.withdrawnRefs,
      requestCount: requestCount + enriched.requestCount,
      pagesFetched: pagesFetched + enriched.pagesFetched,
      stopReason,
      warnings: [...warnings, ...enriched.warnings],
    };
  },
};
