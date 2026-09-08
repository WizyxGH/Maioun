/**
 * Source : Votre Agence Immo (votre-agence-immo.fr) — voir `parser.ts`.
 *
 * Page catégorie « location » en SSR : une requête, puis la fiche des annonces
 * NOUVELLES pour leur description, qui porte l'adresse en clair.
 *
 * Sondée le 2026-09-08 : `robots.txt` permissif (`Allow: /`), quatre locations
 * à Nice. Un petit stock, retenu à la demande de l'utilisateur — une agence de
 * quartier publie peu mais publie ce que les portails n'ont pas toujours.
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
import { parseDetail, parseListPage } from './parser.js';

const LIST_URL = 'https://votre-agence-immo.fr/type_biens/location/';

export const VOTRE_AGENCE_IMMO_DESCRIPTOR: SourceDescriptor = {
  id: 'votre-agence-immo',
  name: 'Votre Agence Immo',
  domain: 'votre-agence-immo.fr',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 6, maxListingsPerRun: 40 }),
  enabled: true,
  // Premier contact par le formulaire du site, à la main de l'utilisateur (§23).
  manualOnly: true,
  allowedPaths: ['/type_biens/location/', '/biens/*'],
  notes:
    'Agence Nice (trois secteurs), WordPress devant Apimo — les photos ' +
    'viennent de media.apimo.pro, mais ni les URL ni le sitemap d’Apimo ne ' +
    's’appliquent. robots.txt vérifié le 2026-09-08 : `Allow: /`. La page ' +
    'catégorie rend des `article.type_biens-location` ; le sitemap des biens ' +
    'mêle ventes et locations sans rien pour les départager.',
};

export const votreAgenceImmoScraper: Scraper = {
  descriptor: VOTRE_AGENCE_IMMO_DESCRIPTOR,

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
          sourceId: VOTRE_AGENCE_IMMO_DESCRIPTOR.id,
          listings: [],
          requestCount,
          pagesFetched,
          stopReason: 'notModified',
          warnings,
        };
      }
      pagesFetched += 1;
      const parsed = parseListPage(response.body);
      listings.push(...parsed.listings);
      warnings.push(...parsed.warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec de la liste : ${message}`);
      context.log('list.failed', { url: LIST_URL, error: message });
      stopReason = message.includes('429') ? 'rateLimited' : 'tooManyErrors';
    }

    // La liste ne donne que le quartier, noyé dans le titre. La fiche écrit
    // l'adresse — « situé au 73 Boulevard Virgile Barel » — de quoi placer une
    // punaise et calculer un trajet (§20). Seules les NOUVELLES sont visitées.
    const enriched = await enrichNewListings(context, listings, {
      max: 5,
      detailUrl: (listing) => listing.sourceUrl ?? null,
      parse: (html) => parseDetail(html),
    });

    context.log('list.parsed', { listings: enriched.listings.length });
    return {
      sourceId: VOTRE_AGENCE_IMMO_DESCRIPTOR.id,
      listings: enriched.listings,
      requestCount: requestCount + enriched.requestCount,
      pagesFetched: pagesFetched + enriched.pagesFetched,
      stopReason,
      warnings: [...warnings, ...enriched.warnings],
    };
  },
};
