/**
 * Mémoire de l'état d'AFFICHAGE de la liste (§36, §39).
 *
 * Tri, filtres rapides, recherche, bascules, sources retenues et vue
 * liste/carte vivaient dans de simples `useState` : un rafraîchissement — ou
 * simplement le retour sur l'onglet après que le navigateur mobile eut déchargé
 * la page — remettait tout à zéro. On refaisait ses réglages plusieurs fois par
 * jour.
 *
 * Ils sont donc conservés dans ce navigateur, et uniquement là : ce sont des
 * préférences d'affichage, pas des données (les critères de COLLECTE, eux,
 * vivent en base et suivent le compte — voir `api/client.ts`).
 *
 * TOLÉRANT PAR CONCEPTION. Stockage refusé, valeur corrompue par une version
 * antérieure, champ manquant : on repart des valeurs par défaut sans bruit.
 * Un réglage d'affichage perdu ne vaut pas un écran d'erreur (§69).
 */

import type { PropertyType } from '@maioun/shared';
import type { SortMode } from './types.js';
import { DEFAULT_QUICK_FILTERS, type QuickFilterValues } from './components/QuickFilters.js';
import { ALL_SOURCES, readSourceSelection, type SourceSelection } from './source-selection.js';

const KEY = 'maioun.viewState';

/** L'état d'affichage complet, tel qu'il est restauré au chargement. */
export interface ViewState {
  readonly sort: SortMode;
  readonly quickFilters: QuickFilterValues;
  /** Le filtre par source, mode compris — voir `source-selection.ts`. */
  readonly sources: SourceSelection;
  readonly search: string;
  readonly hideUncertain: boolean;
  readonly showArchived: boolean;
  readonly favoritesOnly: boolean;
  /** Ne montrer que les annonces dont on n'a rien fait (suivi « Nouvelle »). */
  readonly newOnly: boolean;
  readonly displayMode: 'list' | 'map';
}

export const DEFAULT_VIEW_STATE: ViewState = {
  sort: 'priority',
  quickFilters: DEFAULT_QUICK_FILTERS,
  sources: ALL_SOURCES,
  search: '',
  hideUncertain: false,
  showArchived: false,
  favoritesOnly: false,
  newOnly: false,
  displayMode: 'list',
};

/** Forme sérialisable : `Set` et `ReadonlySet` ne survivent pas à `JSON`. */
interface StoredViewState {
  sort?: unknown;
  quickFilters?: {
    minPrice?: unknown;
    maxPrice?: unknown;
    minArea?: unknown;
    minRooms?: unknown;
    minOccupants?: unknown;
    types?: unknown;
  };
  /** Les sources NOMMÉES. Le champ garde son nom : d'anciens réglages le portent. */
  selectedSources?: unknown;
  /** Ce qu'on en fait. Absent d'un réglage d'avant les modes, d'où la relecture. */
  sourceMode?: unknown;
  search?: unknown;
  hideUncertain?: unknown;
  showArchived?: unknown;
  favoritesOnly?: unknown;
  newOnly?: unknown;
  displayMode?: unknown;
}

/**
 * Tous les tris du menu, et pas trois d'entre eux : la liste avait été figée
 * avant « Le plus proche » et « Surface décroissante », si bien que l'un de ces
 * deux choix disparaissait au rechargement, sans rien dire.
 */
const SORTS: readonly SortMode[] = ['priority', 'recent', 'price', 'closest', 'area'];

function numberOrNull(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Relit l'état d'affichage mémorisé, complété par les valeurs par défaut. */
export function readViewState(): ViewState {
  let stored: StoredViewState;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_VIEW_STATE;
    stored = JSON.parse(raw) as StoredViewState;
  } catch {
    return DEFAULT_VIEW_STATE;
  }
  if (typeof stored !== 'object' || stored === null) return DEFAULT_VIEW_STATE;

  const quick = stored.quickFilters ?? {};
  const defaults = DEFAULT_VIEW_STATE.quickFilters;
  return {
    sort: SORTS.includes(stored.sort as SortMode)
      ? (stored.sort as SortMode)
      : DEFAULT_VIEW_STATE.sort,
    quickFilters: {
      minPrice: numberOrNull(quick.minPrice, defaults.minPrice),
      maxPrice: numberOrNull(quick.maxPrice, defaults.maxPrice),
      minArea: numberOrNull(quick.minArea, defaults.minArea),
      minRooms: numberOrNull(quick.minRooms, defaults.minRooms),
      minOccupants: numberOrNull(quick.minOccupants, defaults.minOccupants),
      types: new Set(strings(quick.types) as PropertyType[]),
    },
    sources: readSourceSelection(stored.selectedSources, stored.sourceMode),
    search: typeof stored.search === 'string' ? stored.search : '',
    hideUncertain: stored.hideUncertain === true,
    showArchived: stored.showArchived === true,
    favoritesOnly: stored.favoritesOnly === true,
    newOnly: stored.newOnly === true,
    displayMode: stored.displayMode === 'map' ? 'map' : 'list',
  };
}

/** Mémorise l'état d'affichage courant. Silencieux si le stockage est refusé. */
export function writeViewState(state: ViewState): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ...state,
        quickFilters: { ...state.quickFilters, types: [...state.quickFilters.types] },
        // Le filtre par source s'écrit à plat, et son ensemble en tableau : une
        // version plus ancienne du site y relira au moins les sources nommées.
        sources: undefined,
        selectedSources: [...state.sources.ids],
        sourceMode: state.sources.mode,
      }),
    );
  } catch {
    /* stockage indisponible : les réglages vaudront pour la session */
  }
}
