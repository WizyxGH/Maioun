/**
 * Ce que la liste affiche, calculé en un seul endroit.
 *
 * La liste et le compteur des recherches enregistrées filtraient chacun à leur
 * façon : le compteur écartait les annonces « à vérifier » et ignorait le mot
 * cherché. Relevé du 2026-09-15 : 50 annonces annoncées pour une recherche qui
 * en affichait 55.
 */

import type { ListingView } from './types.js';
import {
  hasActiveQuickFilters,
  matchesQuickFilters,
  type QuickFilterValues,
} from './components/QuickFilters.js';
import { matchesSearch } from './search.js';

export interface ListingFilter {
  readonly sources: ReadonlySet<string>;
  readonly quick: QuickFilterValues;
  readonly search: string;
  /** Masquer les annonces disparues de leur source depuis plusieurs collectes. */
  readonly hideUncertain: boolean;
}

export function filterListings(
  listings: readonly ListingView[],
  filter: ListingFilter,
): ListingView[] {
  // Les champs rapides AFFICHENT les critères, mais ne filtrent qu'une fois
  // modifiés : appliqués d'emblée, ils ré-excluraient aussitôt les annonces
  // demandées par la bascule « hors critères ».
  const quick = hasActiveQuickFilters(filter.quick) ? filter.quick : null;
  return listings.filter(
    (listing) =>
      (filter.sources.size === 0 ||
        listing.occurrences.some((occurrence) => filter.sources.has(occurrence.sourceId))) &&
      (quick === null || matchesQuickFilters(listing, quick)) &&
      matchesSearch(listing, filter.search) &&
      !(filter.hideUncertain && listing.lifecycle === 'possiblyInactive'),
  );
}
