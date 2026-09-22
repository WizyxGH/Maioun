/**
 * Modale « Filtres » (§36).
 *
 * Regroupe en un seul endroit ce qui RESTREINT la liste : budget, surface,
 * pièces, type, options d'affichage et filtre par source. Ces réglages étaient
 * éparpillés dans la barre d'outils, où rien n'indiquait qu'ils formaient un
 * même geste — régler sa recherche.
 *
 * UNE SEULE LISTE DE FILTRES. On avait un temps séparé « ce qui s'affiche » de
 * « ce qui est collecté », avec deux titres et un encadré. La distinction était
 * juste sur le papier et fausse en pratique : la collecte ramène tout, ces
 * réglages ne font que trier. Deux familles à comprendre pour un seul geste —
 * régler sa recherche — c'était une explication de plus à lire, pas une aide.
 *
 * LE TRI N'EST PLUS ICI. Il y vivait, en tête : on ouvrait donc une modale de
 * filtres pour changer d'ordre, puis on la refermait pour voir le résultat.
 * Changer de tri est un geste fréquent et sans conséquence ; il est passé à
 * l'air libre, dans la barre d'outils. Cette modale ne garde que ce qui
 * RESTREINT la liste — d'où son nom.
 *
 * AFFICHAGE ET SOURCES SONT REPLIÉS. Les cinquante sources dépliées occupaient
 * à elles seules plus de place que tout le reste, et il fallait faire défiler
 * une demi-page pour atteindre le bouton qui compte.
 *
 * L'EN-TÊTE ET LE PIED SONT FIXES. Le bouton qui compte — celui qui dit combien
 * d'annonces restent — se trouvait après huit sections de défilement, et le
 * nombre qu'il porte est précisément ce qu'on regarde en réglant.
 *
 * ON N'ENREGISTRE PAS UNE RECHERCHE ICI. C'est le travail de la page dédiée :
 * un bouton « Enregistrer » à côté d'un bouton « Réinitialiser » et d'un bouton
 * « Voir 42 annonces » faisait trois verbes concurrents dans un même pied.
 *
 * Accessibilité : `role="dialog"` + `aria-modal`, fermeture par Échap ou par le
 * fond, et le focus part sur le premier contrôle.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPriceHistogram, type PriceHistogram } from '../api/client.js';
import { X } from './icons.js';
import type { PropertyType } from '@maioun/shared';
import type { FilterConfig } from '../types.js';
import { formatPropertyType, formatSourceName } from '../format.js';
import {
  OCCUPANT_PRESETS,
  PillButton,
  ROOM_PRESETS,
  SELECTABLE_PROPERTY_TYPES,
  type QuickFilterValues,
} from './QuickFilters.js';
import { FiltersPanel } from './FiltersPanel.js';
import {
  ALL_SOURCES,
  describeSourceSelection,
  includeSources,
  NO_SOURCES,
  restrictsSources,
  sourceAllowed,
  withSourceMode,
  type SourceSelection,
} from '../source-selection.js';
import { MultiSelect } from '@/components/ui/multi-select.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { RangeSlider } from '@/components/ui/range-slider.js';

/**
 * Les bornes du curseur de budget — celles du marché niçois.
 *
 * En dessous de 200 € il n'y a pas de logement ; au-delà de 2500 € on sort de
 * la recherche que cet outil sert. Une borne atteinte vaut « pas de limite ».
 */
const BUDGET_MIN = 200;
const BUDGET_MAX = 2500;

export interface SortFilterModalProps {
  readonly open: boolean;
  readonly onClose: () => void;

  /** Bascules d'affichage : libellé, état, setter. */
  readonly toggles: readonly (readonly [string, boolean, (value: boolean) => void])[];

  /** Budget, surface, pièces et type : les mêmes réglages que les pills. */
  readonly quickFilters: QuickFilterValues;
  readonly onQuickFiltersChange: (next: QuickFilterValues) => void;

  /** Sources présentes dans la liste chargée — les autres ne filtreraient rien. */
  readonly sources: readonly string[];
  /** Annonces par source, affichées à côté du nom. */
  readonly sourceCounts?: ReadonlyMap<string, number>;
  /** Le filtre par source : son mode, et les sources qu'il nomme. */
  readonly sourceFilter: SourceSelection;
  readonly onSourceFilterChange: (next: SourceSelection) => void;

  /**
   * Nombre d'annonces que les réglages courants laissent passer.
   *
   * Affiché SUR le bouton de fermeture : « Voir les résultats » n'apprenait
   * rien, alors qu'on règle un filtre précisément pour savoir combien il en
   * reste — et découvrir une liste vide après avoir fermé la modale oblige à
   * la rouvrir pour comprendre.
   */
  readonly resultCount: number;

  /** Remet tri, filtres, bascules et sources à leur état d'origine. */
  readonly onReset: () => void;
  /**
   * Recharge la liste après un changement de CRITÈRE, qui s'applique côté
   * serveur. Sans lui, le compteur du pied resterait celui d'avant. Reçoit les
   * critères écrits : la barre de puces les montre sans les redemander.
   */
  readonly onCriteriaSaved?: (saved: FilterConfig) => void;
  /** `true` si quelque chose s'écarte de cet état : le bouton reste sinon inerte. */
  readonly dirty: boolean;

  /**
   * Nom de la recherche enregistrée en cours de modification, s'il y en a une.
   *
   * ÉDITER UNE RECHERCHE ENREGISTRÉE DEMANDAIT QUATRE ÉCRANS : la rappeler, la
   * régler ici, revenir à la liste des recherches, appuyer sur « mettre à
   * jour ». Trois d'entre eux ne servaient qu'à retrouver son chemin, et rien
   * ne disait, pendant qu'on réglait, à quelle recherche cela reviendrait.
   *
   * Quand ce nom est là, la modale le dit et son bouton de sortie enregistre.
   */
  readonly editingName?: string | undefined;
  /** Enregistre les réglages dans la recherche en cours de modification. */
  readonly onSaveEdit?: (() => void) | undefined;
  /** Referme sans rien enregistrer dans la recherche modifiée. */
  readonly onCancelEdit?: (() => void) | undefined;
}

/** Intitulé d'un réglage, à l'intérieur d'une famille. */
function FieldLabel({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <legend className="mb-2 text-sm font-medium text-muted-foreground">{children}</legend>;
}

export function SortFilterModal({
  open,
  onClose,
  toggles,
  quickFilters,
  onQuickFiltersChange,
  sources,
  sourceCounts,
  sourceFilter,
  onSourceFilterChange,
  resultCount,
  onReset,
  onCriteriaSaved,
  dirty,
  editingName,
  onSaveEdit,
  onCancelEdit,
}: SortFilterModalProps): React.JSX.Element | null {
  const panel = useRef<HTMLDivElement>(null);
  const [histogram, setHistogram] = useState<PriceHistogram | null>(null);

  // Chargé à la première ouverture seulement : la répartition des loyers
  // bouge à chaque collecte, pas d'une ouverture à l'autre.
  useEffect(() => {
    if (!open || histogram !== null) return undefined;
    let cancelled = false;
    void fetchPriceHistogram().then((next) => {
      if (!cancelled) setHistogram(next);
    });
    return () => {
      cancelled = true;
    };
  }, [open, histogram]);

  // Les sources sont deux cents : `MultiSelect` porte la recherche. Le « (0) »
  // d'une source sans annonce du jour se lit comme tel — on voit d'un coup
  // d'œil lesquelles pèsent, sans avoir à cacher les autres.
  const sourceOptions = useMemo(
    () =>
      sources.map((id) => {
        const name = formatSourceName(id);
        return {
          value: id,
          label: sourceCounts === undefined ? name : `${name} (${sourceCounts.get(id) ?? 0})`,
        };
      }),
    [sources, sourceCounts],
  );

  // LES CASES DISENT CE QUI S'AFFICHE, pas ce que le filtre a mémorisé : en
  // mode « sauf », une source nommée est une source ÉCARTÉE, et une source
  // inconnue du filtre — celles ajoutées depuis — reste cochée.
  const checkedSources = useMemo(
    () => new Set(sources.filter((id) => sourceAllowed(sourceFilter, id))),
    [sources, sourceFilter],
  );

  // Les bascules d'affichage deviennent une sélection multiple : ce sont des
  // booléens indépendants, exactement ce qu'un tel menu représente.
  const toggleOptions = useMemo(
    () => toggles.map(([label]) => ({ value: label, label })),
    [toggles],
  );
  const activeToggles = useMemo(
    () => new Set(toggles.filter(([, checked]) => checked).map(([label]) => label)),
    [toggles],
  );

  // Les types proposés ne bougent pas d'une ouverture à l'autre. Un type
  // retenu qui n'y figurerait pas — une recherche enregistrée d'avant ce
  // réglage — s'ajoute quand même : il filtre, il doit pouvoir se retirer ici.
  const offeredTypes = useMemo(
    () => [...new Set([...SELECTABLE_PROPERTY_TYPES, ...quickFilters.types])],
    [quickFilters.types],
  );

  const patch = (part: Partial<QuickFilterValues>): void =>
    onQuickFiltersChange({ ...quickFilters, ...part });

  const toggleType = (type: PropertyType): void => {
    const next = new Set(quickFilters.types);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    patch({ types: next });
  };

  // Échap ferme la modale. Cet effet dépend de `onClose`, que l'appelant
  // recrée à chaque rendu : il se réexécute donc souvent, ce qui est sans
  // conséquence ici (on ne fait qu'abonner un écouteur).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Le focus n'entre dans la modale QU'À L'OUVERTURE. Le placer dans l'effet
  // ci-dessus le ramenait au premier contrôle à chaque rendu — donc à chaque
  // frappe : impossible de saisir une surface ou un budget.
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('button, input')?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      // Leaflet monte ses panneaux et contrôles jusqu'à z-index 1000 : en `z-50`
      // la carte passait DEVANT la modale.
      className="rf-fade fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Filtres"
        // Le clic à l'intérieur ne doit pas fermer la modale.
        onClick={(event) => event.stopPropagation()}
        // Le voile se fond, le panneau monte : sur téléphone il vient du bas,
        // là où le pouce l'a appelé. `flex-col` + `min-h-0` sur le corps : c'est
        // ce qui fixe l'en-tête et le pied pendant que le milieu défile.
        className="rf-rise flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-lg font-semibold">Filtres</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Fermer"
            className="min-h-0 px-2 text-muted-foreground"
          >
            <X aria-hidden="true" className="size-5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div>
            <fieldset className="mb-4">
              <FieldLabel>Budget</FieldLabel>
              {/* UNE FOURCHETTE, ET NON DEUX CHAMPS. Régler un budget ouvrait le
                clavier du téléphone, effaçait, retapait — et rien ne montrait où
                l'on se situait dans l'échelle des loyers. Le plancher garde son
                utilité : il écarte les annonces trop bon marché pour être
                crédibles (parkings et box mal étiquetés).

                Les bornes sont celles du marché niçois, pas des valeurs rondes
                choisies au hasard : en dessous de 200 € il n'y a pas de
                logement, au-delà de 2500 € on n'est plus dans la recherche que
                cet outil sert. */}
              <RangeSlider
                min={BUDGET_MIN}
                max={BUDGET_MAX}
                step={25}
                lowValue={quickFilters.minPrice ?? BUDGET_MIN}
                highValue={quickFilters.maxPrice ?? BUDGET_MAX}
                lowLabel="Loyer minimum"
                highLabel="Loyer maximum"
                format={(value) => `${value} €`}
                histogram={histogram?.buckets}
                describeHistogram={(inRange, total) =>
                  `${inRange} annonce${inRange > 1 ? 's' : ''} en ligne dans cette fourchette, sur ${total}.`
                }
                onChange={(low, high) =>
                  patch({
                    // Une borne ramenée à son extrémité vaut « pas de limite »,
                    // et non « exactement 200 € » : on la remet à `null`, ce que
                    // le filtre lit comme absent.
                    minPrice: low <= BUDGET_MIN ? null : low,
                    maxPrice: high >= BUDGET_MAX ? null : high,
                  })
                }
              />
            </fieldset>

            <fieldset className="mb-4">
              <FieldLabel>Surface</FieldLabel>
              {/* Un seul champ : une surface MINIMALE suffit à cet usage. */}
              <NumberField
                label="au moins"
                suffix="m²"
                value={quickFilters.minArea}
                onChange={(v) => patch({ minArea: v })}
              />
            </fieldset>

            <fieldset className="mb-4">
              <FieldLabel>Pièces</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                <PillButton
                  selected={quickFilters.minRooms === null}
                  onClick={() => patch({ minRooms: null })}
                >
                  Indifférent
                </PillButton>
                {ROOM_PRESETS.map((r) => (
                  <PillButton
                    key={r}
                    selected={quickFilters.minRooms === r}
                    onClick={() => patch({ minRooms: r })}
                  >
                    {r}+
                  </PillButton>
                ))}
              </div>
            </fieldset>

            <fieldset className="mb-4">
              <FieldLabel>Occupants acceptés</FieldLabel>
              {/* CE N'EST PAS UN FILTRE DE COLOCATION. C'est le plafond que le
                bailleur annonce — « 2 personnes maximum » —, et il vaut pour un
                studio comme pour un quatre-pièces. Une annonce qui n'en publie
                aucun reste affichée : à peine une sur trente en publie un, les
                écarter viderait la liste. Le dire évite de croire à un filtre
                qui ne rend rien. */}
              <p className="text-muted-foreground mb-1.5 text-[0.78rem]">
                Écarte les annonces qui plafonnent en dessous. Presque aucune ne publie ce plafond :
                celles-là restent affichées.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <PillButton
                  selected={quickFilters.minOccupants === null}
                  onClick={() => patch({ minOccupants: null })}
                >
                  Indifférent
                </PillButton>
                {OCCUPANT_PRESETS.map((count) => (
                  <PillButton
                    key={count}
                    selected={quickFilters.minOccupants === count}
                    onClick={() => patch({ minOccupants: count })}
                  >
                    {count}
                  </PillButton>
                ))}
              </div>
            </fieldset>

            <fieldset className="mb-4">
              <FieldLabel>Type de bien</FieldLabel>
              {/* Pilules plutôt que cases à cocher : même geste que « Pièces »
                juste au-dessus, et une sélection lisible d'un coup d'œil. */}
              <div className="flex flex-wrap gap-1.5">
                <PillButton
                  selected={quickFilters.types.size === 0}
                  onClick={() => patch({ types: new Set() })}
                >
                  Tous
                </PillButton>
                {offeredTypes.map((type) => (
                  <PillButton
                    key={type}
                    selected={quickFilters.types.has(type)}
                    onClick={() => toggleType(type)}
                  >
                    {formatPropertyType(type)}
                  </PillButton>
                ))}
              </div>
              {/* CE QUE LA LISTE NE CONTIENDRA JAMAIS, écrit ici. Stationnements
                et locaux professionnels sont écartés en amont — ce ne sont pas
                des logements. Leur absence de ce choix se lisait sinon comme un
                oubli, et l'on pouvait chercher longtemps où régler ça. */}
              <p className="mt-1.5 text-[0.8rem] text-muted-foreground">
                Les stationnements et les locaux professionnels ne sont jamais listés.
              </p>
            </fieldset>

            {/* AFFICHAGE ET SOURCES, REPLIÉS. Les bascules et cinquante lignes
              de sources dépliées remplaçaient à elles seules deux écrans de
              défilement, pour des réglages qu'on touche rarement. Repliés,
              chacun tient sur une ligne et dit ce qu'il contient. */}
            <fieldset className="mb-4">
              <FieldLabel>Affichage</FieldLabel>
              <MultiSelect
                label="Afficher"
                options={toggleOptions}
                selected={activeToggles}
                onToggle={(label) => {
                  const entry = toggles.find(([name]) => name === label);
                  if (entry !== undefined) entry[2](!entry[1]);
                }}
                emptyLabel="Réglages par défaut"
                summarize={(count) => `${count} options`}
              />
            </fieldset>

            {sources.length > 1 && (
              <fieldset className="mb-4">
                <FieldLabel>Sources</FieldLabel>
                {/* LE MODE EST UN CHOIX, PAS UNE DÉDUCTION. On ne gardait que la
                  liste des sources cochées : exclure LocService revenait à
                  cocher les 211 autres, et les sources ajoutées ensuite — il en
                  arrive plusieurs par jour — se retrouvaient exclues sans que
                  personne l'ait demandé. Dire « toutes sauf » ou « seulement »
                  règle le sort des suivantes une fois pour toutes. */}
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <PillButton
                    selected={sourceFilter.mode === 'except'}
                    onClick={() => onSourceFilterChange(withSourceMode(sourceFilter, 'except'))}
                  >
                    Toutes sauf…
                  </PillButton>
                  <PillButton
                    selected={sourceFilter.mode === 'only'}
                    onClick={() => onSourceFilterChange(withSourceMode(sourceFilter, 'only'))}
                  >
                    Seulement…
                  </PillButton>
                </div>
                {/* Décocher « Toutes » ne faisait rien : en mode « sauf », tout
                  recocher redonnait la même liste. Le geste repart donc de zéro
                  — mode « seulement », rien de nommé — pour choisir ensuite. */}
                <MultiSelect
                  label="Sources"
                  options={sourceOptions}
                  selected={checkedSources}
                  onToggle={(id) =>
                    onSourceFilterChange(
                      includeSources(sourceFilter, [id], !checkedSources.has(id)),
                    )
                  }
                  onClear={() => onSourceFilterChange(ALL_SOURCES)}
                  onSelectNone={() => onSourceFilterChange(NO_SOURCES)}
                  onSelectMany={(ids, select) =>
                    onSourceFilterChange(includeSources(sourceFilter, ids, select))
                  }
                  searchable
                  emptyLabel="Toutes"
                  summarize={(count) => `${count} sources`}
                  summary={describeSourceSelection(sourceFilter)}
                  allSelected={!restrictsSources(sourceFilter)}
                />
                {/* Le sort des sources à venir, écrit noir sur blanc : c'est
                  précisément ce que l'ancien réglage taisait. */}
                <p className="mt-1.5 text-[0.8rem] text-muted-foreground">
                  {sourceFilter.mode === 'except'
                    ? 'Les sources ajoutées plus tard s’afficheront aussi.'
                    : 'Les sources ajoutées plus tard ne s’afficheront pas.'}
                </p>
              </fieldset>
            )}

            {/* Trajet, exclusions, bailleur, meublé : les mêmes filtres que
              ci-dessus, dans la même liste. Ils étaient dans un encadré à part,
              sous un titre qui promettait de changer « ce qui est collecté » —
              or on collecte tout, et ils ne font que trier. */}
            <FiltersPanel
              {...(onCriteriaSaved !== undefined ? { onSaved: onCriteriaSaved } : {})}
            />
          </div>
        </div>

        {/* PIED FIXE. Le bouton porte le nombre d'annonces qui restent : c'est
          ce qu'on regarde en réglant, et il se trouvait après huit sections de
          défilement. « Enregistrer cette recherche » l'accompagne — c'est le
          seul écran où l'on voit tous les réglages ensemble, et c'est en le
          refermant qu'on sait si la recherche est la bonne. */}
        <div className="flex flex-col gap-2 border-t border-border px-5 py-3">
          {/* ON MODIFIE UNE RECHERCHE ENREGISTRÉE : le pied le dit, et son
            bouton principal enregistre au lieu de simplement fermer. Sans
            cela, rien n'indiquait pendant le réglage à quelle recherche les
            changements reviendraient — ni comment y revenir. */}
          {editingName !== undefined && (
            <p className="text-center text-[0.82rem] text-muted-foreground">
              Vous modifiez « {editingName} »
            </p>
          )}
          <Button
            className="w-full"
            onClick={editingName !== undefined && onSaveEdit !== undefined ? onSaveEdit : onClose}
          >
            {editingName !== undefined
              ? `Enregistrer « ${editingName} »`
              : resultCount === 0
                ? 'Aucun résultat'
                : `Voir ${resultCount} annonce${resultCount > 1 ? 's' : ''}`}
          </Button>
          {editingName !== undefined && onCancelEdit !== undefined && (
            <Button variant="ghost" className="w-full" onClick={onCancelEdit}>
              Fermer sans enregistrer
            </Button>
          )}
          {/* EN DESSOUS, et discret. Côte à côte, les deux boutons se
            disputaient la largeur d'un téléphone et le geste de sortie —
            celui qu'on fait à chaque ouverture — se retrouvait rétréci par
            celui qu'on fait une fois sur vingt. Il ne s'affiche que s'il y a
            quelque chose à défaire. */}
          {dirty && (
            <Button variant="ghost" className="w-full" onClick={onReset}>
              Réinitialiser
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Champ numérique court, précédé d'un libellé et suivi de son unité. */
function NumberField({
  label,
  suffix,
  value,
  onChange,
}: {
  readonly label: string;
  readonly suffix: string;
  readonly value: number | null;
  readonly onChange: (value: number | null) => void;
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {/* ALIGNÉ À DROITE : le nombre se retrouve ainsi collé à son unité —
        « 700 € » plutôt que « 700      € ». C'est aussi ce que faisait déjà
        l'autre famille de champs de cette modale, sans que celle-ci suive. */}
      <Input
        size="sm"
        type="number"
        inputMode="numeric"
        min={0}
        value={value ?? ''}
        onChange={(event) => {
          const next = event.target.value.trim();
          onChange(next === '' ? null : Number(next));
        }}
        className="w-24 text-right"
      />
      <span className="text-muted-foreground">{suffix}</span>
    </label>
  );
}
