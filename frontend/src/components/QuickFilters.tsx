/**
 * Filtres rapides de la liste (§36, §39) : le MODÈLE et le rappel visuel.
 *
 * Ils affinent la liste DÉJÀ chargée, sans toucher aux critères de collecte
 * réglés dans l'onglet « Filtres ». Les CONTRÔLES vivent dans la modale
 * « Filtres » (voir `SortFilterModal.tsx`) ; ce composant n'affiche
 * plus que les puces des filtres posés, pour les voir d'un coup d'œil et les
 * retirer un à un ou tous d'un coup — les menus déroulants d'origine faisaient
 * doublon avec la modale.
 */

import { MVP_CRITERIA, type PropertyType } from '@rentfinder/shared';
import { formatPropertyType } from '../format.js';

/** État des filtres rapides. `null`/vide = filtre inactif. */
export interface QuickFilterValues {
  /** Loyer plancher : écarte les annonces trop bon marché pour être crédibles. */
  readonly minPrice: number | null;
  readonly maxPrice: number | null;
  readonly minArea: number | null;
  readonly minRooms: number | null;
  /**
   * Nombre de personnes à loger. Ne filtre QUE les annonces qui annoncent un
   * plafond : la plupart n'en publient aucun, et les écarter reviendrait à
   * vider la liste pour une information que les sources ne donnent pas (§17).
   */
  readonly minOccupants: number | null;
  readonly types: ReadonlySet<PropertyType>;
}

/** Aucun filtre. Sert de base au calcul de « ce qui a été modifié ». */
const EMPTY_QUICK_FILTERS: QuickFilterValues = {
  minPrice: null,
  maxPrice: null,
  minArea: null,
  minRooms: null,
  minOccupants: null,
  types: new Set(),
};

/**
 * Réglage d'ouverture : VOS critères de recherche, pas des champs vides.
 *
 * Les champs partaient vides alors que les critères existent et sont connus
 * (250–700 €, ≥ 20 m²). Il fallait les ressaisir pour affiner, et rien à
 * l'écran ne rappelait sur quoi la liste était bâtie.
 */
export const DEFAULT_QUICK_FILTERS: QuickFilterValues = {
  minPrice: MVP_CRITERIA.minPrice ?? null,
  maxPrice: MVP_CRITERIA.maxPrice,
  minArea: MVP_CRITERIA.minArea,
  minRooms: null,
  minOccupants: null,
  types: new Set(),
};

/**
 * `true` si les filtres S'ÉCARTENT des critères de recherche.
 *
 * On compare au réglage par défaut et non au vide : sans cela, la pastille
 * « filtres actifs » s'allumerait en permanence, puisque les champs sont
 * désormais pré-remplis.
 */
export function hasActiveQuickFilters(v: QuickFilterValues): boolean {
  const d = DEFAULT_QUICK_FILTERS;
  return (
    v.minPrice !== d.minPrice ||
    v.maxPrice !== d.maxPrice ||
    v.minArea !== d.minArea ||
    v.minRooms !== d.minRooms ||
    v.minOccupants !== d.minOccupants ||
    v.types.size !== d.types.size
  );
}

/**
 * `true` si un filtre est RÉELLEMENT POSÉ — indépendamment des valeurs par
 * défaut.
 *
 * DEUX QUESTIONS, ET UN SEUL PRÉDICAT LES SERVAIT. « L'état s'écarte-t-il de
 * l'ouverture ? » commande le bouton « Réinitialiser » et le court-circuit du
 * filtrage ; « y a-t-il un filtre à montrer ? » commande la barre de puces.
 * Les deux réponses diffèrent parce que l'état d'ouverture n'est PAS « aucun
 * filtre » : il porte déjà 250–700 € et ≥ 20 m².
 *
 * Ce que la confusion produisait, et qui se voyait à l'écran :
 *
 * - à l'ouverture, la liste était filtrée sur le budget et la surface SANS
 *   qu'aucune puce ne le dise, et sans moyen de les retirer ;
 * - « Effacer tout » posait des valeurs nulles — lesquelles S'ÉCARTENT des
 *   valeurs par défaut : la barre restait donc affichée, réduite au seul lien
 *   « Effacer tout », sur lequel on pouvait recliquer indéfiniment sans que
 *   rien ne bouge.
 */
/** L'intitulé de la puce « budget », selon les bornes réellement posées. */
export function priceLabel(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min} – ${max} €`;
  if (max !== null) return `≤ ${max} €`;
  return `≥ ${min ?? 0} €`;
}

export function hasAppliedQuickFilters(v: QuickFilterValues): boolean {
  return (
    v.minPrice !== null ||
    v.maxPrice !== null ||
    v.minArea !== null ||
    v.minRooms !== null ||
    v.minOccupants !== null ||
    v.types.size > 0
  );
}

/** Champs d'une annonce que les filtres rapides inspectent (§17). */
export interface QuickFilterable {
  readonly price: { readonly value: number | null };
  readonly area: { readonly value: number | null };
  readonly rooms: { readonly value: number | null };
  readonly propertyType: { readonly value: PropertyType };
  readonly maxOccupants?: { readonly value: number | null };
}

/**
 * `true` si l'annonce satisfait TOUS les filtres posés. Une valeur inconnue ne
 * peut pas satisfaire un seuil → l'annonce est écartée quand ce filtre est posé.
 */
export function matchesQuickFilters(listing: QuickFilterable, v: QuickFilterValues): boolean {
  if (v.maxPrice !== null && (listing.price.value === null || listing.price.value > v.maxPrice)) {
    return false;
  }
  if (v.minPrice !== null && (listing.price.value === null || listing.price.value < v.minPrice)) {
    return false;
  }
  if (v.minArea !== null && (listing.area.value === null || listing.area.value < v.minArea)) {
    return false;
  }
  if (v.minRooms !== null && (listing.rooms.value === null || listing.rooms.value < v.minRooms)) {
    return false;
  }
  // Le plafond d'occupants n'est publié que par une poignée de sources : une
  // annonce muette RESTE dans la liste. Filtrer sur une donnée que presque
  // personne ne fournit viderait l'écran sans rien apprendre (§17).
  const occupants = listing.maxOccupants?.value ?? null;
  if (v.minOccupants !== null && occupants !== null && occupants < v.minOccupants) {
    return false;
  }
  return v.types.size === 0 || v.types.has(listing.propertyType.value);
}

export const ROOM_PRESETS = [1, 2, 3, 4, 5] as const;

/** Tailles de groupe courantes. Au-delà de 4, l'offre niçoise est anecdotique. */
export const OCCUPANT_PRESETS = [1, 2, 3, 4] as const;

interface QuickFiltersProps {
  readonly values: QuickFilterValues;
  readonly onChange: (next: QuickFilterValues) => void;
}

export function QuickFilters({ values, onChange }: QuickFiltersProps): React.JSX.Element {
  const patch = (part: Partial<QuickFilterValues>): void => onChange({ ...values, ...part });

  const toggleType = (type: PropertyType): void => {
    const next = new Set(values.types);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    patch({ types: next });
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Puces des filtres POSÉS, retirables. Le prédicat n'est pas celui du
        bouton « Réinitialiser » : on montre ce qui filtre la liste, y compris
        le budget et la surface d'ouverture, et non ce qui s'écarte de
        l'ouverture. Voir `hasAppliedQuickFilters`. */}
      {hasAppliedQuickFilters(values) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {/* UNE SEULE PUCE POUR LE BUDGET, parce que c'est une fourchette.
            `minPrice` n'en avait aucune — le plancher anti-parking à 250 €
            filtrait la liste sans jamais se montrer, et la barre pouvait donc
            s'afficher sans contenir la moindre puce à retirer. Deux puces
            « ≥ 250 € » et « ≤ 700 € » côte à côte diraient la même chose en
            deux fois plus de place : on les réunit, et les retirer va de
            pair. */}
          {(values.minPrice !== null || values.maxPrice !== null) && (
            <FilterChip
              label={priceLabel(values.minPrice, values.maxPrice)}
              onRemove={() => patch({ minPrice: null, maxPrice: null })}
            />
          )}
          {values.minArea !== null && (
            <FilterChip
              label={`≥ ${values.minArea} m²`}
              onRemove={() => patch({ minArea: null })}
            />
          )}
          {values.minOccupants !== null && (
            <FilterChip
              label={`${values.minOccupants} personne${values.minOccupants > 1 ? 's' : ''}`}
              onRemove={() => patch({ minOccupants: null })}
            />
          )}
          {values.minRooms !== null && (
            <FilterChip
              label={`${values.minRooms}+ pièces`}
              onRemove={() => patch({ minRooms: null })}
            />
          )}
          {[...values.types].map((type) => (
            <FilterChip
              key={type}
              label={formatPropertyType(type)}
              onRemove={() => toggleType(type)}
            />
          ))}
          <button
            type="button"
            onClick={() => onChange(EMPTY_QUICK_FILTERS)}
            className="ml-1 min-h-9 cursor-pointer text-sm font-medium text-muted-foreground underline hover:text-foreground"
          >
            Effacer tout
          </button>
        </div>
      )}
    </div>
  );
}

/** Petit bouton-pilule sélectionnable, réutilisé dans les panneaux. */
export function PillButton({
  selected,
  onClick,
  children,
}: {
  readonly selected: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-9 cursor-pointer rounded-full border px-3 text-sm font-medium transition-colors ${
        selected
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-foreground hover:border-primary'
      }`}
    >
      {children}
    </button>
  );
}

/** Puce d'un filtre actif, avec croix de retrait. */
function FilterChip({
  label,
  onRemove,
}: {
  readonly label: string;
  readonly onRemove: () => void;
}): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-1 pr-1 pl-2.5 text-sm font-medium text-primary">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer le filtre ${label}`}
        className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full hover:bg-primary/20"
      >
        ×
      </button>
    </span>
  );
}
