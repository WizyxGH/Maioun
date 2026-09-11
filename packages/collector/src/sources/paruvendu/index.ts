/**
 * Source : ParuVendu, locations d'appartements à Nice. Voir `parser.ts`.
 *
 * L'INVENTAIRE ENTIER À CHAQUE PASSAGE : 150 annonces sur cinq pages, soit cinq
 * requêtes. Pas d'arrêt anticipé, donc un cycle de vie qui tranche à chaque
 * fois — la leçon de LocService, où l'arrêt sur du déjà-vu empêchait de jamais
 * retirer une annonce partie.
 *
 * Les pages inchangées (304) sont confirmées par la mémoire des pages.
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
import { pageUrlFor, parseSearchPage } from './parser.js';

/** Cinq pages aujourd'hui ; la marge couvre un marché qui gonfle. */
const MAX_PAGES = 8;

export const PARUVENDU_DESCRIPTOR: SourceDescriptor = {
  id: 'paruvendu',
  name: 'ParuVendu',
  domain: 'paruvendu.fr',
  kind: 'portal',
  method: 'html',
  // Des particuliers, que presque aucune autre source n'apporte.
  priority: 2,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', {
    maxPagesPerRun: MAX_PAGES,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  // Le contact passe par le formulaire du site : jamais automatisé.
  manualOnly: true,
  // Le portail REPUBLIE des annonces d'agences — LocService, BEP, Citya… Deux
  // annonces de cette source qui partagent une photo sont donc le même bien.
  relaysListings: true,
  allowedPaths: [
    '/immobilier/recherche/location/appartement/nice/',
    '/immobilier/location/appartement/*',
  ],
  notes:
    'robots.txt vérifié le 2026-09-11 : ferme /immobilier/annonceimmofo/, ' +
    '/immobilier/annoncefo/ et les paramètres ?pagv=, ?tri=, ?d=, ?fulltext= ; ' +
    'la pagination ?p=N reste ouverte. 150 annonces à Nice, dont 13 de ' +
    'particuliers ; les deux tiers viennent d’agences déjà collectées, que le ' +
    'dédoublonnage rapproche.',
};

export const paruvenduScraper: Scraper = {
  descriptor: PARUVENDU_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const confirmedRefs: string[] = [];
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';
    let pageInconnue = false;

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (context.shouldStop()) {
        stopReason = 'maxPages';
        break;
      }
      const url = pageUrlFor(page);
      try {
        const response = await context.fetch(url);
        requestCount += 1;

        if (response.notModified) {
          // Page inchangée : ses annonces aussi. On ne sait pas si elle a une
          // suivante — on continue, une page vide dira la fin.
          const refs = await context.pageRefs.get(url);
          if (refs === null) pageInconnue = true;
          else confirmedRefs.push(...refs);
          continue;
        }
        pagesFetched += 1;

        const parsed = parseSearchPage(response.body, url);
        if (parsed.listings.length === 0) {
          if (page === 1) warnings.push(...parsed.warnings);
          break;
        }
        listings.push(...parsed.listings);
        await context.pageRefs.set(
          url,
          parsed.listings.map((listing) => listing.sourceRef),
        );
        if (!parsed.hasNextPage) break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Échec de la page ${page} : ${message}`);
        context.log('list.failed', { url, error: message });
        stopReason = message.includes('429') ? 'rateLimited' : 'tooManyErrors';
        break;
      }
    }

    // Un inventaire à trou ne doit rien retirer.
    if (pageInconnue && stopReason === 'completed') stopReason = 'notModified';

    return {
      sourceId: PARUVENDU_DESCRIPTOR.id,
      listings,
      confirmedRefs,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
