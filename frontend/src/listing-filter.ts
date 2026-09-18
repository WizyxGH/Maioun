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
  hasAppliedQuickFilters,
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
  /**
   * Ne garder que les annonces QU'ON N'A PAS ENCORE OUVERTES.
   *
   * Première version : le statut de suivi. L'utilisateur voulait autre chose —
   * « celles que je n'ai pas encore regardées » — et une annonce ouverte, lue,
   * puis laissée sans décision garde le statut « nouvelle » : elle repassait
   * donc devant lui à chaque visite, ce que ce filtre devait précisément
   * éviter.
   *
   * CE N'EST TOUJOURS PAS LA FRAÎCHEUR. « Découverte il y a deux heures » se
   * lit sur la carte et se classe par le tri « Plus récentes » ; ici on écarte
   * ce qu'on a déjà parcouru, quel que soit son âge.
   */
  readonly newOnly: boolean;
}

export function filterListings(
  listings: readonly ListingView[],
  filter: ListingFilter,
): ListingView[] {
  // UNE PUCE AFFICHÉE FILTRE VRAIMENT. On demandait ici « l'état s'écarte-t-il
  // de l'ouverture ? », alors que la barre de puces demande « y a-t-il un
  // filtre posé ? » : à l'arrivée, 250–700 € et ≥ 20 m² s'affichaient en puces,
  // se comptaient dans la pastille, et n'écartaient rien. Un studio de 18 m²
  // restait donc dans la liste sous une puce « ≥ 20 m² ».
  //
  // Pire, ils s'allumaient d'un coup au premier autre réglage : choisir « 1
  // personne » — que presque aucune annonce ne renseigne — faisait disparaître
  // ce studio, et élargir le budget jusqu'à « sans limite » aussi.
  const quick = hasAppliedQuickFilters(filter.quick) ? filter.quick : null;
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
      !(filter.hideUncertain && isUncertain(listing)) &&
      // Ouverte une fois suffit à la retirer : le but est de ne plus revoir ce
      // qu'on a déjà parcouru, même sans avoir rien décidé ensuite.
      !(filter.newOnly && listing.viewed === true),
  );
}
