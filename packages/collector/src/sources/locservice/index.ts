/**
 * Source : LocService (locservice.fr) — voir l'étude dans `parser.ts`.
 *
 * UN PORTAIL DE PARTICULIERS, ce qui manquait : l'essentiel du stock du projet
 * vient d'agences. Neuf cent cinquante logements référencés pour Nice.
 *
 * Sondée le 2026-09-08 : `robots.txt` ouvre les pages de commune et ferme
 * l'espace locataire — on ne lit donc que les premières (§10). Quarante-sept
 * annonces par page.
 *
 * QUATRE PAGES PAR PASSAGE, et pas vingt : deux cents annonces suffisent à
 * rattraper les nouveautés d'un cycle, et l'arrêt anticipé (§9) coupe dès que
 * la page ne contient plus que du déjà-vu. Le stock entier entrerait en
 * quelques jours, sans peser sur personne (§30).
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
import { pageUrlFor, parseListPage } from './parser.js';

/** La page « toutes natures » d'une commune : appartements, studios, maisons. */
const NICE_BASE = 'https://www.locservice.fr/alpes-maritimes-06/location-nice';

const MAX_PAGES = 4;

export const LOCSERVICE_DESCRIPTOR: SourceDescriptor = {
  id: 'locservice',
  name: 'LocService',
  domain: 'locservice.fr',
  kind: 'portal',
  method: 'html',
  // Priorité haute : du particulier, que les autres sources n'apportent pas.
  priority: 1,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', { maxPagesPerRun: MAX_PAGES, maxListingsPerRun: 250 }),
  enabled: true,
  // LEUR MÉTIER EST LA MISE EN RELATION, contre paiement. On ne cherche donc
  // ni adresse ni téléphone, et l'on n'écrit jamais à leur place (§23, §24).
  manualOnly: true,
  allowedPaths: ['/alpes-maritimes-06/location-*'],
  notes:
    'Portail de particuliers. robots.txt vérifié le 2026-09-08 : ferme ' +
    '/locataires/consulter/, /locataires/match-*, /proprietaires/locations/ ' +
    'et /selections-* ; les pages de commune restent ouvertes, ce sont les ' +
    'seules lues. Cartes `li.accommodation-ad`, 47 par page, pagination ' +
    '`-pN.html`. Le contact passe par leur service payant : jamais extrait.',
};

export const locserviceScraper: Scraper = {
  descriptor: LOCSERVICE_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const bySourceRef = new Map<string, RawListing>();
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (context.shouldStop()) {
        stopReason = 'maxPages';
        break;
      }
      const url = pageUrlFor(NICE_BASE, page);
      try {
        const response = await context.fetch(url);
        requestCount += 1;
        // Page inchangée : les suivantes le sont aussi, la liste étant triée
        // par fraîcheur. Insister coûterait des requêtes pour rien (§30).
        if (response.notModified) break;
        pagesFetched += 1;

        const parsed = parseListPage(response.body, url);
        // Le premier avertissement suffit : répété à chaque page, il noierait
        // le journal sans rien apprendre de plus.
        if (parsed.listings.length === 0) {
          if (page === 1) warnings.push(...parsed.warnings);
          break;
        }
        for (const listing of parsed.listings) bySourceRef.set(listing.sourceRef, listing);

        // ARRÊT ANTICIPÉ (§9) : une page entièrement connue signale qu'on est
        // retombé dans le stock déjà collecté.
        if (parsed.listings.every((listing) => context.isKnown(listing.sourceRef))) {
          stopReason = 'knownTerritory';
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Échec de la page ${page} : ${message}`);
        context.log('list.failed', { url, error: message });
        stopReason = message.includes('429') ? 'rateLimited' : 'tooManyErrors';
        break;
      }
    }

    const listings = [...bySourceRef.values()];
    context.log('list.parsed', { listings: listings.length, pages: pagesFetched });
    return {
      sourceId: LOCSERVICE_DESCRIPTOR.id,
      listings,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
