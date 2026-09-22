/**
 * Source : lesiteimmo.com — portail régional PACA. Étude dans `parser.ts`.
 *
 * L'INVENTAIRE SE LIT PAR COMMUNE, en suivant la pagination `?page=N` jusqu'au
 * total que la page annonce elle-même. Vingt-cinq annonces par page, 255 pour
 * les appartements niçois au relevé du 2026-09-22.
 *
 * UN PLAFOND DE PAGES, et il est là pour une raison : la somme des totaux doit
 * pouvoir être vérifiée, mais un portail qui se met à paginer à l'infini — ou
 * qui répète la même page — ne doit pas dépenser tout le budget d'un passage.
 * Ce qui dépasse sera lu au passage suivant, la source étant relue souvent.
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

const ORIGIN = 'https://www.lesiteimmo.com';
/** Les deux recherches qui portent l'inventaire niçois. */
const SEARCHES = ['/louer/appartement/nice-06000', '/louer/maison/nice-06000'];
const PER_PAGE = 25;
const MAX_PAGES_PER_SEARCH = 6;

const PERIMETER_NAMES = PERIMETER_COMMUNES.map((commune) =>
  comparable(commune.slug.replace(/-/g, ' ')),
);

/** Le périmètre, jugé sur le NOM : Nice a quatre codes postaux. */
function inPerimeter(city: string): boolean {
  const name = comparable(city);
  return name !== '' && PERIMETER_NAMES.some((commune) => name.includes(commune));
}

export const LESITEIMMO_DESCRIPTOR: SourceDescriptor = {
  id: 'lesiteimmo',
  name: 'LeSiteImmo',
  domain: 'lesiteimmo.com',
  kind: 'portal',
  method: 'html',
  priority: 3,
  // Il RELAIE : ses annonces viennent d'agences, dont beaucoup sont déjà nos
  // sources. Le dédoublonnage en tient compte (photo partagée, nom d'agence).
  relaysListings: true,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', {
    maxPagesPerRun: SEARCHES.length * MAX_PAGES_PER_SEARCH,
    maxListingsPerRun: 400,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  allowedPaths: ['/louer/*'],
  notes:
    'robots.txt vérifié le 2026-09-22 : ferme /recherche*, /api, /a/, ' +
    '/honoraires et /index.php ; /louer/… et sa pagination ?page=N restent ' +
    'ouverts. SON SITEMAP MENT PAR OMISSION — sept locations niçoises ' +
    'déclarées, 255 sur la page publique. Tout vient du JSON-LD de la liste : ' +
    'loyer, pièces, surface, description, photos, DATE DE PUBLICATION et ' +
    'nom de l’agence. Aucune fiche visitée.',
};

export const lesiteimmoScraper: Scraper = {
  descriptor: LESITEIMMO_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    for (const search of SEARCHES) {
      let pages = 1;
      for (let page = 1; page <= Math.min(pages, MAX_PAGES_PER_SEARCH); page += 1) {
        const url = page === 1 ? `${ORIGIN}${search}` : `${ORIGIN}${search}?page=${page}`;
        try {
          const response = await context.fetch(url);
          requestCount += 1;
          if (response.notModified) continue;
          pagesFetched += 1;
          const parsed = parseListPage(response.body, inPerimeter);
          listings.push(...parsed.listings);
          warnings.push(...parsed.warnings);
          // LE TOTAL ANNONCÉ DIT COMBIEN DE PAGES LIRE, plutôt que de suivre
          // des liens de pagination : une page vide arrête tout de suite.
          if (page === 1 && parsed.total !== null) {
            pages = Math.ceil(parsed.total / PER_PAGE);
          }
          if (parsed.listings.length === 0) break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Échec de ${url} : ${message}`);
          context.log('list.failed', { url, error: message });
          stopReason = stopReasonFromError(message);
          break;
        }
      }
    }

    // La même annonce peut figurer dans deux recherches : l'identifiant tranche.
    const uniques = [...new Map(listings.map((l) => [l.sourceRef, l])).values()];

    context.log('list.parsed', { listings: uniques.length });
    return {
      sourceId: LESITEIMMO_DESCRIPTOR.id,
      listings: uniques,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
