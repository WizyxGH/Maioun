/**
 * Source : Square Habitat (squarehabitat.fr), le réseau du Crédit Agricole.
 * Étude et pièges dans `parser.ts`.
 *
 * DEUX PAGES SUFFISENT. Le site élargit de lui-même aux communes voisines,
 * si bien que demander Nice et Cagnes-sur-Mer ramène aussi Saint-Laurent-du-Var
 * et Villeneuve-Loubet. Interroger les treize communes du périmètre coûterait
 * treize requêtes pour le même stock.
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
import { comparable } from '../../normalization/text.js';
import { PERIMETER_COMMUNES } from '../shared/communes.js';
import { stopReasonFromError } from '../shared/stop-reason.js';
import { parseListPage } from './parser.js';

const ORIGIN = 'https://www.squarehabitat.fr';
const SEARCH = '/annonces/location/bien/appartement/immobilier/provence-alpes-cote-d-azur';

/** Les deux pages demandées ; le site élargit au reste du périmètre. */
const PAGES = [
  `${ORIGIN}${SEARCH}/alpes-maritimes/nice-06000`,
  `${ORIGIN}${SEARCH}/alpes-maritimes/cagnes-sur-mer-06800`,
];

/**
 * Le périmètre, jugé sur le NOM de la commune.
 *
 * Nice a quatre codes postaux et le périmètre n'en nomme qu'un : juger sur le
 * code jetterait trois annonces niçoises sur cinq, sans un mot.
 */
const PERIMETER_NAMES = PERIMETER_COMMUNES.map((commune) =>
  comparable(commune.slug.replace(/-/g, ' ')),
);

function inPerimeter(city: string): boolean {
  const name = comparable(city.replace(/\(\d{5}\)/g, ''));
  return name !== '' && PERIMETER_NAMES.some((commune) => name.includes(commune));
}

export const SQUARE_HABITAT_DESCRIPTOR: SourceDescriptor = {
  id: 'square-habitat',
  name: 'Square Habitat',
  domain: 'squarehabitat.fr',
  kind: 'agencyNetwork',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('agencyNetwork'),
  budget: budgetFor('agencyNetwork', {
    maxPagesPerRun: PAGES.length,
    maxListingsPerRun: 80,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  allowedPaths: [`${SEARCH}/*`],
  notes:
    'robots.txt relu le 2026-09-22 : il ferme /resultat-location — l’ANCIEN ' +
    'chemin, d’où le refus périmé du 2026-08-15 — mais laisse /annonces/ ' +
    'ouvert, où vivent les fiches depuis la refonte. Tout est sur la page de ' +
    'liste (prix, pièces, surface, description) plus un JSON-LD par bien avec ' +
    'URL canonique et coordonnées : aucune fiche à visiter.',
};

export const squareHabitatScraper: Scraper = {
  descriptor: SQUARE_HABITAT_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    for (const url of PAGES) {
      try {
        const response = await context.fetch(url);
        requestCount += 1;
        if (response.notModified) continue;
        pagesFetched += 1;
        const parsed = parseListPage(
          response.body,
          url,
          SQUARE_HABITAT_DESCRIPTOR.name,
          inPerimeter,
        );
        listings.push(...parsed.listings);
        warnings.push(...parsed.warnings);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Échec de ${url} : ${message}`);
        context.log('list.failed', { url, error: message });
        stopReason = stopReasonFromError(message);
        break;
      }
    }

    // LA MÊME ANNONCE PARAÎT SUR LES DEUX PAGES, puisque le site élargit :
    // une seule fois suffit, et c'est l'identifiant du bien qui tranche.
    const uniques = [...new Map(listings.map((l) => [l.sourceRef, l])).values()];

    context.log('list.parsed', { listings: uniques.length });
    return {
      sourceId: SQUARE_HABITAT_DESCRIPTOR.id,
      listings: uniques,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
