/**
 * Filtres rapides de la liste (§36, §39) : le MODÈLE et le rappel visuel.
 *
 * Ils affinent la liste DÉJÀ chargée, sans toucher aux critères de collecte
 * réglés dans l'onglet « Filtres ». Les CONTRÔLES vivent dans la modale
 * « Filtres » (voir `SortFilterModal.tsx`) ; ce composant n'affiche
 * plus que les puces des filtres posés, pour les voir d'un coup d'œil et les
 * retirer un à un ou tous d'un coup — les menus déroulants d'origine faisaient
 * doublon avec la modale.
 *
 * UNE SEULE RANGÉE, QUI DÉFILE. Les puces se repliaient sur deux, trois, parfois
 * quatre lignes : six à dix filtres posés — ce qui est le cas courant, critères
 * compris — repoussaient les annonces hors de l'écran sur un téléphone, et la
 * hauteur de la barre changeait à chaque filtre retiré. Elles tiennent
 * maintenant sur une ligne qui défile horizontalement, et le débordement se
 * voit (voir `ChipRail`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MVP_CRITERIA, rentForBudget, type PropertyType } from '@maioun/shared';
import { formatPropertyType } from '../format.js';
import { Button } from '@/components/ui/button.js';
import { Toggle } from '@/components/ui/toggle.js';

/** État des filtres rapides. `null`/vide = filtre inactif. */
export interface QuickFilterValues {
  /** Loyer plancher : écarte les annonces trop bon marché pour être crédibles. */
  readonly minPrice: number | null;
  readonly maxPrice: number | null;
  readonly minArea: number | null;
  /** Surface plafond. Absente, la surface n'avait qu'un plancher. */
  readonly maxArea: number | null;
  readonly minRooms: number | null;
  /**
   * Nombre de personnes à loger. Ne filtre QUE les annonces qui annoncent un
   * plafond : la plupart n'en publient aucun, et les écarter reviendrait à
   * vider la liste pour une information que les sources ne donnent pas (§17).
   */
  readonly minOccupants: number | null;
  readonly types: ReadonlySet<PropertyType>;
}

/** Aucun filtre : ce que pose « Effacer tout ». */
export const EMPTY_QUICK_FILTERS: QuickFilterValues = {
  minPrice: null,
  maxPrice: null,
  minArea: null,
  maxArea: null,
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
  // Aucun plafond par défaut : le projet n'en pose pas, et en inventer un
  // écarterait des annonces que personne n'a demandé d'écarter.
  maxArea: MVP_CRITERIA.maxArea ?? null,
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
    v.maxArea !== d.maxArea ||
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
export function hasAppliedQuickFilters(v: QuickFilterValues): boolean {
  return appliedQuickFilterCount(v) > 0;
}

/**
 * COMBIEN de filtres rapides sont posés — c'est-à-dire combien de puces la
 * barre affiche. La pastille du bouton « Filtres » s'en sert : elle ne comptait
 * que le tri, les sources et les bascules, et annonçait « 1 » alors qu'un
 * budget, une surface et un type restreignaient la liste.
 *
 * LE BUDGET COMPTE POUR UN : `minPrice` et `maxPrice` sont une fourchette, et
 * n'ont qu'une puce — deux la feraient compter deux fois.
 */
export function appliedQuickFilterCount(v: QuickFilterValues): number {
  return (
    (v.minPrice !== null || v.maxPrice !== null ? 1 : 0) +
    (v.minArea !== null || v.maxArea !== null ? 1 : 0) +
    (v.minOccupants !== null ? 1 : 0) +
    (v.minRooms !== null ? 1 : 0) +
    v.types.size
  );
}

/** L'intitulé de la puce « surface », selon les bornes réellement posées. */
export function areaLabel(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min} – ${max} m²`;
  if (max !== null) return `≤ ${max} m²`;
  return `≥ ${min ?? 0} m²`;
}

/** L'intitulé de la puce « budget », selon les bornes réellement posées. */
export function priceLabel(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min} – ${max} €`;
  if (max !== null) return `≤ ${max} €`;
  return `≥ ${min ?? 0} €`;
}

/** Champs d'une annonce que les filtres rapides inspectent (§17). */
export interface QuickFilterable {
  readonly price: { readonly value: number | null };
  readonly charges?: { readonly value: number | null };
  /** Non enveloppé, contrairement aux autres : c'est ainsi que la fiche l'expose. */
  readonly chargesIncluded?: boolean | null;
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
  // LE BUDGET SE JUGE CHARGES COMPRISES, comme côté serveur : une annonce
  // publiée en deux morceaux — 566 € plus 158 € de provision — coûte 724 €, et
  // le curseur doit voir ce nombre-là. Le plancher, lui, reste sur le montant
  // publié : il sert à reconnaître un box à 100 €, pas à juger un total.
  const allIn = rentForBudget({
    price: listing.price.value,
    charges: listing.charges?.value ?? null,
    chargesIncluded: listing.chargesIncluded ?? null,
  });
  if (v.maxPrice !== null && (allIn === null || allIn > v.maxPrice)) {
    return false;
  }
  if (v.minPrice !== null && (listing.price.value === null || listing.price.value < v.minPrice)) {
    return false;
  }
  if (v.minArea !== null && (listing.area.value === null || listing.area.value < v.minArea)) {
    return false;
  }
  // LE PLAFOND N'ÉCARTE PAS UNE SURFACE INCONNUE, contrairement au plancher :
  // celui-ci sert à reconnaître un box, celui-là à refuser un grand logement —
  // et une annonce muette n'est pas un grand logement (§17).
  if (v.maxArea !== null && listing.area.value !== null && listing.area.value > v.maxArea) {
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

/**
 * Les types de bien PROPOSABLES, une fois pour toutes.
 *
 * LA LISTE DÉPENDAIT DE CE QUI ÉTAIT CHARGÉ : elle se déduisait des annonces
 * présentes à l'écran, et la liste arrive en deux temps (cinquante d'abord,
 * tout ensuite). Les choix changeaient donc sous les doigts une seconde après
 * l'ouverture — « Loft » n'existait pas, puis apparaissait. Les options d'un
 * filtre ne doivent pas dépendre de ce qui a fini d'arriver.
 *
 * NI PARKING NI LOCAL PROFESSIONNEL : ce ne sont pas des logements, et ils sont
 * écartés en amont — du catalogue comme des critères. Les proposer donnerait
 * des filtres qui ne ramènent jamais rien. La modale le dit à l'écran plutôt
 * que de laisser chercher où ils sont passés.
 *
 * `unknown` non plus : « Type inconnu » n'est pas un type qu'on cherche, et
 * aucune annonce active n'y reste — la normalisation les range toutes.
 *
 * Dans l'ordre de ce que Nice propose, le plus courant d'abord.
 */
export const SELECTABLE_PROPERTY_TYPES: readonly PropertyType[] = [
  'apartment',
  'studio',
  'house',
  'room',
  'loft',
  'other',
];

export const ROOM_PRESETS = [1, 2, 3, 4, 5] as const;

/** Tailles de groupe courantes. Au-delà de 4, l'offre niçoise est anecdotique. */
export const OCCUPANT_PRESETS = [1, 2, 3, 4] as const;

/**
 * Une restriction posée ailleurs que dans les filtres rapides, montrée ici.
 *
 * TOUTES SE RETIRENT. Deux d'entre elles — les quartiers, le plafond de trajet
 * — s'affichaient sans croix, avec un renvoi au panneau : rien à l'écran ne
 * disait pourquoi ces deux-là seulement. Les raisons de fond ont été traitées
 * ailleurs (retour arrière après effacement, « aucun plafond » réellement
 * enregistrable), et la puce n'a plus de cas particulier.
 */
export interface ExtraChip {
  readonly label: string;
  readonly onRemove: () => void;
}

interface QuickFiltersProps {
  readonly values: QuickFilterValues;
  readonly onChange: (next: QuickFilterValues) => void;
  /**
   * Ce qui restreint la liste sans passer par ces filtres : recherche texte,
   * sources retenues, bascules d'affichage. Elles filtraient sans se montrer,
   * et « Effacer tout » les laissait en place — on effaçait donc « tout » sans
   * que la liste change.
   */
  readonly extras?: readonly ExtraChip[];
  /**
   * Efface les filtres rapides ET les restrictions ci-dessus — critères de
   * recherche compris, depuis que l'utilisateur l'a demandé. C'est l'appelant
   * qui porte le retour arrière : lui seul sait ce qu'il vient d'écrire.
   */
  readonly onClearAll?: () => void;
}

export function QuickFilters({
  values,
  onChange,
  extras = [],
  onClearAll,
}: QuickFiltersProps): React.JSX.Element {
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
      {(hasAppliedQuickFilters(values) || extras.length > 0) && (
        <div className="flex items-center gap-1">
          <ChipRail>
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
            {/* Une seule puce pour la fourchette, comme le budget : « ≥ 20 m² »
              et « ≤ 60 m² » côte à côte diraient la même chose en deux fois
              plus de place. */}
            {(values.minArea !== null || values.maxArea !== null) && (
              <FilterChip
                label={areaLabel(values.minArea, values.maxArea)}
                onRemove={() => patch({ minArea: null, maxArea: null })}
              />
            )}
            {values.minOccupants !== null && (
              <FilterChip
                label={`${values.minOccupants} occupant${values.minOccupants > 1 ? 's' : ''} accepté${values.minOccupants > 1 ? 's' : ''}`}
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
            {extras.map((chip) => (
              <FilterChip key={chip.label} label={chip.label} onRemove={chip.onRemove} />
            ))}
          </ChipRail>
          {/* « EFFACER TOUT » RESTE HORS DE LA RANGÉE QUI DÉFILE. Dedans, il
            partait à droite derrière six puces : il aurait fallu faire défiler
            pour trouver le bouton qui sert précisément à ne plus avoir à
            défiler. */}
          <Button
            variant="link"
            size="inline"
            onClick={onClearAll ?? ((): void => onChange(EMPTY_QUICK_FILTERS))}
            className="min-h-9 shrink-0 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground"
          >
            Effacer tout
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * LA RANGÉE DE PUCES, SUR UNE SEULE LIGNE QUI DÉFILE.
 *
 * `flex-wrap` les empilait : à dix filtres posés — le cas courant depuis que
 * les critères ont leur puce — la barre prenait trois lignes sur un téléphone
 * de 320 px et repoussait la première annonce sous le pli, et sa hauteur
 * changeait à chaque puce retirée.
 *
 * TROIS PRÉCAUTIONS, chacune pour un défaut constaté :
 *
 *  - `min-w-0` : sans lui, un enfant de flex refuse de descendre sous la
 *    largeur de son contenu, et c'est LA PAGE qui déborde au lieu de la barre.
 *  - `touch-pan-x` et `overscroll-x-contain` : le geste reste sur cet axe, et
 *    arrivé au bout il ne se propage pas à la page — sinon glisser les puces
 *    fait rebondir l'écran.
 *  - LE DÉBORDEMENT SE VOIT. Une rangée coupée net ressemble à une rangée
 *    complète : on ne va pas chercher ce qu'on ne soupçonne pas. Un voile
 *    dégradé marque chaque bord encore parcourable, avec un chevron à droite.
 *    La barre d'onglets du haut, elle, masque sa barre de défilement — c'est
 *    précisément ce qu'on ne refait pas ici.
 */
function ChipRail({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const rail = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback((): void => {
    const el = rail.current;
    if (el === null) return;
    // La marge d'un pixel absorbe les largeurs fractionnaires : sans elle, un
    // voile s'affiche sur une rangée qui tient pourtant entière.
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((current) =>
      current.start === start && current.end === end ? current : { start, end },
    );
  }, []);

  // À CHAQUE RENDU, sans tableau de dépendances : le nombre de puces change
  // sans prévenir — une puce retirée peut rendre la rangée entièrement
  // visible, et le voile resterait alors sur une barre qui ne défile plus.
  // `setEdges` ne repart que si la réponse a changé : la boucle s'arrête.
  useEffect(measure);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={rail}
        onScroll={measure}
        data-testid="filter-chips"
        className="flex touch-pan-x items-center gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
      >
        {children}
      </div>
      {edges.start && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent"
        />
      )}
      {edges.end && (
        <span
          aria-hidden="true"
          data-testid="filter-chips-more"
          className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-end bg-gradient-to-l from-background via-background to-transparent text-muted-foreground"
        >
          ›
        </span>
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
    <Toggle pressed={selected} onClick={onClick}>
      {children}
    </Toggle>
  );
}

/** Puce d'un filtre actif, avec sa croix de retrait. */
function FilterChip({
  label,
  onRemove,
}: {
  readonly label: string;
  readonly onRemove: () => void;
}): React.JSX.Element {
  return (
    // LA CIBLE DU « × » FAIT 36 px, PAS 20. Elle est restée petite tant que les
    // puces ne s'affichaient qu'après avoir posé un filtre : on ne la
    // rencontrait qu'en connaissance de cause. Depuis qu'elles montrent aussi le
    // budget et la surface d'ouverture, elle est là dès l'arrivée — et un
    // bouton de 20 px se rate au doigt (§36). Le rond coloré du survol garde sa
    // taille : c'est la ZONE SENSIBLE qui grandit, pas le dessin.
    <span className="inline-flex min-h-9 shrink-0 items-center gap-0.5 rounded-full border border-primary/40 bg-primary/10 pr-0.5 pl-2.5 text-sm font-medium whitespace-nowrap text-foreground">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer le filtre ${label}`}
        className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full"
      >
        <span className="inline-flex size-5 items-center justify-center rounded-full hover:bg-primary/20">
          ×
        </span>
      </button>
    </span>
  );
}
