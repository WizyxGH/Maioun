/**
 * Menu déroulant à choix MULTIPLES, avec recherche facultative.
 *
 * POURQUOI IL EXISTE. Deux réglages de la modale de filtres étaient des listes
 * dépliées en permanence : les quatre bascules d'affichage, et surtout les
 * cinquante sources. À elles seules, celles-ci occupaient plus de place que
 * tout le reste, et l'on faisait défiler une demi-page pour atteindre le bouton
 * qui compte. Replié, chacun de ces blocs tient sur une ligne et dit ce qu'il
 * contient.
 *
 * SANS NOUVELLE DÉPENDANCE. shadcn/ui construit ce contrôle sur Radix et cmdk ;
 * ce projet n'en a aucun des deux, et les ajouter pour un seul écran coûterait
 * plus cher à maintenir que ces cent lignes. On en reprend donc l'apparence et
 * le comportement — déclencheur qui résume la sélection, panneau flottant,
 * champ de recherche, lignes cochables — avec des éléments natifs : ce sont eux
 * que le projet privilégie partout ailleurs (§39, §65).
 *
 * CE QU'IL FAUT POUR QUE CE SOIT UTILISABLE, et qu'un panneau bricolé oublie
 * presque toujours : Échap referme, un clic à l'extérieur referme, le champ de
 * recherche reçoit le focus à l'ouverture, et le déclencheur porte
 * `aria-expanded`. Le panneau lui-même est une liste de cases à cocher : la
 * navigation au clavier vient alors du navigateur, sans code.
 *
 * IL EMPRUNTE SES CLASSES À `Select`. Fermé, ce déclencheur joue le rôle d'un
 * menu déroulant ; il n'y a aucune raison qu'il ait une autre bordure, un autre
 * arrondi ou une autre hauteur que celui d'à côté — c'est pourtant ce qui
 * arrivait, et ce qui arrivera encore si on le restyle ici plutôt que là-bas.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from '../icons.js';
import { cn } from '@/lib/utils.js';
import { selectVariants } from './select.js';

export interface MultiSelectOption {
  readonly value: string;
  readonly label: string;
}

export interface MultiSelectProps {
  /** Intitulé du réglage, affiché sur le déclencheur. */
  readonly label: string;
  readonly options: readonly MultiSelectOption[];
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (value: string) => void;
  /**
   * Remet la sélection à zéro — une sélection vide vaut « tout ». Présent, une
   * ligne « tout » (`emptyLabel`) s'affiche en tête de liste.
   */
  readonly onClear?: () => void;
  /**
   * Coche (`true`) ou décoche plusieurs valeurs d'un geste. Présent, une recherche
   * propose d'agir sur tous les résultats affichés.
   */
  readonly onSelectMany?: (values: readonly string[], select: boolean) => void;
  /** Ajoute un champ de recherche. À réserver aux longues listes. */
  readonly searchable?: boolean;
  /** Ce qu'affiche le déclencheur quand rien n'est sélectionné. */
  readonly emptyLabel: string;
  /** Ce qu'affiche le déclencheur pour n éléments. Défaut : « n sélectionnés ». */
  readonly summarize?: (count: number) => string;
}

/** Compare sans accents ni casse : « Bien'ici » se trouve en tapant « bienici ». */
function comparable(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  onClear,
  onSelectMany,
  searchable = false,
  emptyLabel,
  summarize,
}: MultiSelectProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const panelId = useId();

  // Échap et clic extérieur. Les deux écouteurs ne vivent QUE pendant
  // l'ouverture : un panneau fermé n'a aucune raison d'écouter le document.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchable) search.current?.focus();
  }, [open, searchable]);

  const needle = comparable(query).trim();
  const shown =
    needle === ''
      ? options
      : options.filter(
          (option) =>
            comparable(option.label).includes(needle) || comparable(option.value).includes(needle),
        );

  const count = selected.size;
  // EXCLURE SE LIT COMME EXCLURE. Quand presque tout est coché, « 18 sources »
  // ne dit pas ce qu'on a retiré : on nomme les absents, qui sont le choix réel.
  const missing = options.filter((option) => !selected.has(option.value));
  /** Tout cocher revient à ne rien restreindre : on repasse à « tout », plus clair à relire. */
  const toggle = (value: string): void => {
    if (onClear !== undefined && missing.length === 1 && missing[0]?.value === value) onClear();
    else onToggle(value);
  };
  const summary =
    count === 0
      ? emptyLabel
      : count === 1
        ? (options.find((option) => selected.has(option.value))?.label ?? emptyLabel)
        : missing.length > 0 && missing.length <= 3
          ? `Sauf ${missing.map((option) => option.label).join(', ')}`
          : (summarize?.(count) ?? `${count} sélectionnés`);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(selectVariants(), 'flex w-full items-center gap-2 text-left text-sm')}
      >
        <span className="text-muted-foreground shrink-0">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right font-medium">{summary}</span>
        <ChevronDown
          aria-hidden="true"
          className={`text-muted-foreground size-4 shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          id={panelId}
          className="border-border bg-card absolute z-10 mt-1 w-full rounded-lg border p-1 shadow-lg"
        >
          {searchable && (
            <input
              ref={search}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher…"
              aria-label={`Rechercher dans ${label}`}
              className="border-border mb-1 w-full rounded-md border px-2 py-1.5 text-sm"
            />
          )}

          {/* « TOUT », EN TÊTE ET NON EN BAS : une sélection vide vaut tout, et
            rien ne le disait — on cochait un quartier en croyant en retirer un.
            À moitié cochée dès qu'une sélection restreint la liste.
            LE DÉCOCHER COCHE TOUT LE RESTE plutôt que de ne rien laisser : c'est
            ainsi qu'on RETIRE une source, geste qu'une liste d'inclusion seule
            rendait impossible — cocher LocService donnait « seulement
            LocService », l'inverse de ce qu'on voulait. */}
          {onClear !== undefined && needle === '' && (
            <label className="border-border mb-1 flex cursor-pointer items-center gap-2 rounded-md border-b px-2 py-1.5 text-sm font-medium hover:bg-muted">
              <input
                ref={(input) => {
                  if (input !== null) input.indeterminate = count > 0;
                }}
                type="checkbox"
                checked={count === 0}
                onChange={() => {
                  if (count > 0 || onSelectMany === undefined) onClear();
                  else
                    onSelectMany(
                      options.map((option) => option.value),
                      true,
                    );
                }}
                className="size-4 shrink-0"
              />
              <span className="min-w-0 flex-1 truncate">{emptyLabel}</span>
            </label>
          )}

          {/* UNE RECHERCHE SE COCHE EN BLOC : « nice nord » donne quatre
            quartiers, un geste les prend tous — ou les retire tous. */}
          {onSelectMany !== undefined && needle !== '' && shown.length > 1 && (
            <button
              type="button"
              onClick={() =>
                onSelectMany(
                  shown.map((option) => option.value),
                  !shown.every((option) => selected.has(option.value)),
                )
              }
              className="text-primary hover:bg-muted mb-1 w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm font-medium"
            >
              {shown.every((option) => selected.has(option.value)) ? 'Décocher' : 'Cocher'} les{' '}
              {shown.length} résultats
            </button>
          )}

          <ul className="flex max-h-60 flex-col overflow-y-auto">
            {shown.length === 0 && (
              <li className="text-muted-foreground px-2 py-2 text-sm">Aucun résultat.</li>
            )}
            {shown.map((option) => {
              const checked = selected.has(option.value);
              return (
                <li key={option.value}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(option.value)}
                      className="size-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {checked && (
                      <Check aria-hidden="true" className="text-primary size-4 shrink-0" />
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
