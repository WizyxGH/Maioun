/**
 * La barre de recherche, et ce qu'elle propose pendant qu'on tape.
 *
 * ON TAPAIT À L'AVEUGLE. Il fallait connaître le nom exact d'un quartier ou
 * d'une rue pour s'en servir — « borigl » ne donnait rien, « Borriglione » tout
 * — et rien ne disait ce qu'il y avait à chercher. Les suggestions viennent des
 * annonces DÉJÀ CHARGÉES, avec leur compte : aucune ne mène à une liste vide.
 *
 * AU CLAVIER AUTANT QU'AU DOIGT. Flèches pour parcourir, Entrée pour retenir,
 * Échap pour renoncer. Une liste qu'on ne peut atteindre qu'à la souris est
 * inutilisable là où l'on tape justement.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { suggestSearch, type SearchSuggestion, type Searchable } from '../search.js';
import { Input } from '@/components/ui/input.js';
import { Search } from './icons.js';

/** Ce qu'annonce chaque famille de suggestion. */
const KIND_LABEL: Readonly<Record<SearchSuggestion['kind'], string>> = {
  district: 'quartier',
  street: 'rue',
  agency: 'agence',
  city: 'commune',
};

export function SearchBox({
  value,
  onChange,
  listings,
}: {
  readonly value: string;
  readonly onChange: (next: string) => void;
  /** Les annonces d'où sortent les suggestions. */
  readonly listings: readonly Searchable[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  /** Entrée surlignée au clavier. `-1` = aucune, la saisie fait foi. */
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  const suggestions = open ? suggestSearch(listings, value) : [];

  // Un clic AILLEURS referme. Sans cela, la liste restait ouverte par-dessus
  // les annonces qu'elle venait de proposer.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent): void => {
      if (box.current !== null && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  const choose = (suggestion: SearchSuggestion): void => {
    onChange(suggestion.value);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      // Seulement si une entrée est SURLIGNÉE : sans cela, Entrée validerait la
      // première suggestion au lieu de ce qu'on vient d'écrire.
      const chosen = suggestions[active];
      if (chosen !== undefined) {
        event.preventDefault();
        choose(chosen);
      }
    }
  };

  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <Input
        type="search"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Rechercher (quartier, rue, agence…)"
        aria-label="Rechercher une annonce"
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        // 16 px (`text-base`) sur mobile : en dessous, iOS zoome
        // automatiquement à la mise au point et désaligne la page.
        className="w-full rounded-full pr-3 pl-9 text-base sm:min-h-9 sm:py-1.5 sm:text-sm"
      />
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />

      {suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="border-border bg-card absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-xl border shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.kind}:${suggestion.value}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                // `onMouseDown` et non `onClick` : le clic retire d'abord le
                // focus du champ, ce qui refermait la liste avant que le choix
                // ne parvienne.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(suggestion);
                }}
                onMouseEnter={() => setActive(index)}
                className={`flex w-full cursor-pointer items-baseline gap-2 px-3 py-2 text-left text-sm ${
                  index === active ? 'bg-muted' : ''
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{suggestion.value}</span>
                <span className="text-muted-foreground shrink-0 text-[0.75rem]">
                  {KIND_LABEL[suggestion.kind]} · {suggestion.count}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
