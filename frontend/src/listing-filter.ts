/**
 * Ce que la liste affiche, calculé en un seul endroit.
 *
 * La liste et le compteur des recherches enregistrées filtraient chacun à leur
 * façon : le compteur écartait les annonces « à vérifier » et ignorait le mot
 * cherché. Relevé du 2026-09-15 : 50 annonces annoncées pour une recherche qui
 * en affichait 55.
 */

import type { ListingView } from './types.js';
import { isUncertain } from './availability.js';
import {
  hasActiveQuickFilters,
  matchesQuickFilters,
  type QuickFilterValues,
} from './components/QuickFilters.js';
import { matchesSearch } from './search.js';
import { restrictsSources, sourceAllowed, type SourceSelection } from './source-selection.js';

export interface ListingFilter {
  /** Le filtre par source : « seulement celles-ci » ou « toutes sauf celles-ci ». */
  readonly sources: SourceSelection;
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
      // Une annonce reste dès qu'UNE de ses sources passe : la même annonce est
      // souvent publiée par plusieurs.
      (!restrictsSources(filter.sources) ||
        listing.occurrences.some((occurrence) =>
          sourceAllowed(filter.sources, occurrence.sourceId),
        )) &&
      (quick === null || matchesQuickFilters(listing, quick)) &&
      matchesSearch(listing, filter.search) &&
      !(filter.hideUncertain && isUncertain(listing)),
  );
}
