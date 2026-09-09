/**
 * Source : Century 21 (réseau d'agences).
 *
 * Le verdict initial « écartée » reposait sur une lecture trop rapide du
 * robots.txt : seules les recherches par CODE POSTAL (`cp-…`) et par agence
 * sont interdites — le format par ville `/annonces/location-appartement/v-nice/`
 * ne l'est pas, s'affiche en SSR et se déclare lui-même indexable. Corrigé le
 * 2026-08-15, voir docs/sources.md.
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
import { parseDetail, parseSearchPage } from './parser.js';

/**
 * Fiches visitées par exécution, pour les annonces NOUVELLES seulement.
 *
 * LA CARTE TRONQUE, et le site l'annonce : le fragment qu'elle affiche porte
 * la classe `tw-truncate-safe`. Relevé du 2026-09-08 — 238 caractères de
 * moyenne sur les trente-quatre annonces en base, coupés en plein mot, contre
 * 577 sur la fiche, adresse de rue comprise. (La fiche porte aussi une
 * traduction anglaise : le parseur ne retient que le français.)
 *
 * Le stock niçois de Century 21 tourne autour de trente-cinq annonces : dix
 * visites par cycle couvrent une première collecte en quatre passages, puis il
 * n'en reste qu'une poignée à chaque parution (§30).
 */
const MAX_DETAILS = 10;

/** Une page = tout le stock locatif C21 à Nice (19 annonces observées). */
const ENTRY_URL = 'https://www.century21.fr/annonces/location-appartement/v-nice/';

export const CENTURY21_DESCRIPTOR: SourceDescriptor = {
  id: 'century21',
  name: 'Century 21',
  domain: 'century21.fr',
  kind: 'agencyNetwork',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('agencyNetwork'),
  budget: budgetFor('agencyNetwork', {
    maxPagesPerRun: 1 + MAX_DETAILS,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  manualOnly: true,
  allowedPaths: ['/annonces/location-appartement/v-*', '/trouver_logement/detail/*'],
  notes:
    'robots.txt vérifié le 2026-08-15, relu le 2026-09-08 : cp-* et ' +
    '/a/*/annonces/ interdits (recherches par code postal et par agence), le ' +
    'format par ville v-nice ne l’est pas (SSR, meta robots index), et les ' +
    'fiches /trouver_logement/detail/ non plus — seul /a/*/trouver_logement/, ' +
    'la variante par agence, est fermé. Une page couvre tout le stock — pas de ' +
    'pagination. Réf. agence dans le h3. Les fiches des annonces nouvelles ' +
    'sont visitées (10 par exécution) : la carte tronque la description.',
};

export const century21Scraper: Scraper = {
  descriptor: CENTURY21_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const warnings: string[] = [];
    let pagesFetched = 0;
    let requestCount = 0;
    let stopReason: StopReason = 'completed';

    try {
      const response = await context.fetch(ENTRY_URL);
      requestCount += 1;

      if (response.notModified) {
        context.log('page.not_modified', { url: ENTRY_URL });
        stopReason = 'notModified';
      } else {
        pagesFetched += 1;
        const parsed = parseSearchPage(response.body, ENTRY_URL);
        warnings.push(...parsed.warnings);

        let known = 0;
        const fromList: RawListing[] = [];
        for (const listing of parsed.listings) {
          if (context.isKnown(listing.sourceRef)) known += 1;
          fromList.push(listing);
        }

        // LA CARTE TRONQUE — sa classe s'appelle `tw-truncate-safe`. La fiche
        // des annonces NOUVELLES porte le texte entier, souvent précédé de
        // l'adresse de rue.
        const enriched = await enrichNewListings(context, fromList, {
          max: MAX_DETAILS,
          detailUrl: (listing) => listing.sourceUrl,
          parse: (html) => parseDetail(html),
        });
        listings.push(...enriched.listings);
        requestCount += enriched.requestCount;
        pagesFetched += enriched.pagesFetched;
        warnings.push(...enriched.warnings);

        context.log('page.parsed', {
          url: ENTRY_URL,
          found: parsed.listings.length,
          known,
          details: enriched.pagesFetched,
        });
      }
    } catch (error) {
      // §69 : échec propre, les autres sources continuent.
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec sur ${ENTRY_URL} : ${message}`);
      context.log('page.failed', { url: ENTRY_URL, error: message });
      stopReason = message.includes('429')
        ? 'rateLimited'
        : message.includes('refusé')
          ? 'blocked'
          : 'tooManyErrors';
    }

    return {
      sourceId: CENTURY21_DESCRIPTOR.id,
      listings,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
