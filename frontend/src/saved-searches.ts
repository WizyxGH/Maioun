/**
 * Recherches enregistrées.
 *
 * POURQUOI. Les réglages d'une recherche vivaient à deux endroits sans
 * rapport : les critères de collecte dans un repli de « Filtres », et
 * l'affinage de la liste dans le reste de la même modale. On réglait sept
 * champs, on trouvait ce qu'on cherchait, et le lendemain il fallait tout
 * recommencer — rien ne gardait le jeu complet.
 *
 * Une recherche enregistrée est ce jeu complet, nommé : les critères ET
 * l'affinage. La rappeler remet l'écran exactement dans l'état où on l'avait
 * laissé.
 *
 * CE QU'ELLE N'EST PAS : un abonnement. La collecte ne lit que les critères
 * ACTIFS ; une recherche enregistrée est un signet, pas une alerte de plus. Le
 * dire clairement évite d'attendre des notifications qui ne viendront pas.
 *
 * Elle vit en base et non dans le navigateur, pour la même raison que les
 * critères : un téléphone et un ordinateur doivent voir les mêmes.
 */

import {
  MVP_CRITERIA,
  districtLabel,
  splitCommune,
  toTitleCase,
  type PropertyType,
} from '@maioun/shared';
import type { FilterConfig, SortMode } from './types.js';
import { DEFAULT_QUICK_FILTERS, type QuickFilterValues } from './components/QuickFilters.js';
import {
  describeSourceSelection,
  readSourceSelection,
  restrictsSources,
  type SourceMode,
  type SourceSelection,
} from './source-selection.js';

/** L'affinage d'affichage, sous une forme qui passe par JSON. */
export interface SavedView {
  readonly minPrice: number | null;
  readonly maxPrice: number | null;
  readonly minArea: number | null;
  readonly minRooms: number | null;
  readonly minOccupants: number | null;
  /** Types de bien retenus. Un tableau, `Set` ne survivant pas à JSON. */
  readonly types: readonly PropertyType[];
  /** Les sources NOMMÉES par le filtre. Un tableau, `Set` ne survivant pas à JSON. */
  readonly sources: readonly string[];
  /**
   * Ce qu'on en fait : les garder seules, ou garder tout le reste.
   *
   * Absent des recherches enregistrées avant les modes — elles ne portaient
   * qu'une liste de sources retenues, relue par `readSourceSelection`.
   */
  readonly sourceMode?: SourceMode;
  readonly sort: SortMode;
  readonly search: string;
}

/** Le filtre par source d'une recherche enregistrée, anciennes comprises. */
export function savedSourceSelection(view: Partial<SavedView> | undefined): SourceSelection {
  return readSourceSelection(view?.sources, view?.sourceMode);
}

export interface SavedSearch {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  /** Ce qu'on RAMÈNE : budget, surface, ville, exclusions. */
  readonly criteria: FilterConfig;
  /** Ce qu'on REGARDE dans ce qui a été ramené. */
  readonly view: SavedView;
}

/** `QuickFilterValues` → forme enregistrable. */
export function toSavedView(
  quick: QuickFilterValues,
  extra: { sources: SourceSelection; sort: SortMode; search: string },
): SavedView {
  return {
    minPrice: quick.minPrice,
    maxPrice: quick.maxPrice,
    minArea: quick.minArea,
    minRooms: quick.minRooms,
    minOccupants: quick.minOccupants,
    types: [...quick.types],
    sources: [...extra.sources.ids],
    sourceMode: extra.sources.mode,
    sort: extra.sort,
    search: extra.search,
  };
}

/**
 * Forme enregistrée → `QuickFilterValues`.
 *
 * Tolérante : une recherche écrite par une version plus ancienne peut manquer
 * un champ. On retombe alors sur le réglage d'ouverture plutôt que de refuser
 * de la rappeler (§69).
 */
export function toQuickFilters(view: Partial<SavedView> | undefined): QuickFilterValues {
  if (view === undefined) return DEFAULT_QUICK_FILTERS;
  return {
    minPrice: view.minPrice ?? DEFAULT_QUICK_FILTERS.minPrice,
    maxPrice: view.maxPrice ?? DEFAULT_QUICK_FILTERS.maxPrice,
    minArea: view.minArea ?? DEFAULT_QUICK_FILTERS.minArea,
    minRooms: view.minRooms ?? null,
    minOccupants: view.minOccupants ?? null,
    types: new Set(view.types ?? []),
  };
}

/** Ce qu'un critère de recherche désigne : sert à lui choisir une icône. */
export type SearchPartKind =
  | 'place'
  | 'budget'
  | 'area'
  | 'rooms'
  | 'occupants'
  | 'types'
  | 'commute'
  | 'landlord'
  | 'furnished'
  | 'sources'
  | 'text';

export interface SearchPart {
  readonly kind: SearchPartKind;
  readonly label: string;
}

/**
 * Ville d'un critère, telle qu'une carte l'écrit : « Saint-Laurent-du-Var ».
 *
 * Les critères la gardent en minuscules pour la comparer ; seul l'affichage la
 * recapitalise. On ne passe pas par `formatCommune`, qui couperait un nom
 * inconnu commençant par une commune connue (« nice nord » → « Nice ») : ici
 * c'est l'utilisateur qui l'a écrit, rien ne s'y colle.
 */
export function formatCriteriaCity(city: string): string {
  const { commune, district } = splitCommune(city);
  return district === null ? commune : toTitleCase(city);
}

/** Au-delà, la ligne de critères passerait à la ligne pour des noms de quartier. */
const MAX_DISTRICTS_SHOWN = 2;

/** « Cimiez, Libération +3 » : les premiers quartiers, puis combien d'autres. */
export function formatDistricts(slugs: readonly string[]): string {
  if (slugs.length === 0) return '';
  const shown = slugs.slice(0, MAX_DISTRICTS_SHOWN).map(districtLabel).join(', ');
  const rest = slugs.length - MAX_DISTRICTS_SHOWN;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

/** Les critères d'une recherche, un par un, dans l'ordre où on les lit. */
export function searchParts(search: SavedSearch): readonly SearchPart[] {
  const parts: SearchPart[] = [];
  const add = (kind: SearchPartKind, label: string): void => {
    parts.push({ kind, label });
  };
  const { criteria, view } = search;

  const cities = criteria.cities.filter((city) => city !== '');
  const districts = criteria.districts ?? [];
  if (cities.length > 0 || districts.length > 0) {
    const place = cities.map(formatCriteriaCity).join(', ');
    const where = formatDistricts(districts);
    add('place', [place, where].filter((part) => part !== '').join(' · '));
  }

  const low = view.minPrice ?? criteria.minPrice ?? null;
  const high = view.maxPrice ?? criteria.maxPrice;
  if (low !== null && high !== undefined) add('budget', `${low}–${high} €`);
  else if (high !== undefined) add('budget', `≤ ${high} €`);

  const area = view.minArea ?? criteria.minArea;
  if (area > 0) add('area', `≥ ${area} m²`);

  if (view.minRooms !== null)
    add('rooms', `≥ ${view.minRooms} pièce${view.minRooms > 1 ? 's' : ''}`);
  if (view.minOccupants !== null) add('occupants', `${view.minOccupants} pers.`);
  if (view.types.length > 0) add('types', view.types.join(', '));

  if (criteria.maxCommuteMinutes !== undefined) {
    add('commute', `trajet ≤ ${criteria.maxCommuteMinutes} min`);
  }
  if (criteria.landlordFilter === 'private') add('landlord', 'particuliers');
  if (criteria.landlordFilter === 'agency') add('landlord', 'agences');
  if (criteria.furnishedFilter === 'furnished') add('furnished', 'meublé');
  if (criteria.furnishedFilter === 'unfurnished') add('furnished', 'non meublé');
  // « Sauf LocService » ou « Seulement Orpi +3 » : le mot dit le SENS du
  // filtre. « 19 sources » cachait qu'une recherche rappelée écartait tout ce
  // qu'elle ne nommait pas, agences ajoutées depuis comprises.
  const sources = savedSourceSelection(view);
  if (restrictsSources(sources)) add('sources', describeSourceSelection(sources));
  if (view.search !== '') add('text', `« ${view.search} »`);
  return parts;
}

/**
 * Une phrase qui dit ce que la recherche cherche.
 *
 * C'est ce qu'on lit dans la liste des recherches pour reconnaître la sienne :
 * elle doit tenir sur une ligne et ne citer que ce qui est RÉGLÉ. Un critère
 * laissé à sa valeur d'usine n'apprend rien et n'y figure pas.
 */
export function describeSearch(search: SavedSearch): string {
  const parts = searchParts(search);
  return parts.length === 0 ? 'Tous les logements' : parts.map((part) => part.label).join(' · ');
}

/**
 * Un nom par défaut, pour n'avoir rien à écrire quand on est pressé.
 *
 * Il reprend les deux faits qui distinguent le mieux une recherche d'une autre
 * — la ville et le budget —, parce qu'un « Recherche 3 » ne se reconnaît pas.
 */
export function suggestName(criteria: FilterConfig, quick: QuickFilterValues): string {
  const city = criteria.cities[0] ?? MVP_CRITERIA.cities[0] ?? 'Nice';
  const budget = quick.maxPrice ?? criteria.maxPrice;
  const capitalized = formatCriteriaCity(city);
  return budget === undefined ? capitalized : `${capitalized} ≤ ${budget} €`;
}

/** Identifiant local, stable une fois écrit. `crypto` est présent partout. */
export function newSearchId(): string {
  return crypto.randomUUID();
}
