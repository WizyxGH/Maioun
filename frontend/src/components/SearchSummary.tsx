/**
 * Le résumé d'une recherche enregistrée : chaque critère avec son icône.
 *
 * En une seule ligne de texte (« Nice · 250–700 € · ≥ 20 m² · trajet ≤ 60 min »),
 * les critères se confondaient ; l'icône dit d'un coup d'œil lequel est lequel.
 */

import { cn } from '@/lib/utils.js';
import { searchParts, type SavedSearch, type SearchPartKind } from '../saved-searches.js';
import {
  Armchair,
  BadgeEuro,
  Door,
  Home,
  MapPin,
  Ruler,
  Search,
  Stack,
  TrainFront,
  UserCircle,
  Users,
  type IconComponent,
} from './icons.js';

const ICONS: Readonly<Record<SearchPartKind, IconComponent>> = {
  place: MapPin,
  budget: BadgeEuro,
  area: Ruler,
  rooms: Door,
  occupants: Users,
  types: Home,
  commute: TrainFront,
  landlord: UserCircle,
  furnished: Armchair,
  sources: Stack,
  text: Search,
};

export function SearchSummary({
  search,
  className,
}: {
  readonly search: SavedSearch;
  readonly className?: string;
}): React.JSX.Element {
  const parts = searchParts(search);
  if (parts.length === 0) {
    return <span className={cn('text-muted-foreground', className)}>Tous les logements</span>;
  }
  return (
    <span className={cn('flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground', className)}>
      {parts.map((part) => {
        const Icon = ICONS[part.kind];
        return (
          <span
            key={part.kind + part.label}
            className="inline-flex items-center gap-1 whitespace-nowrap"
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0" />
            {part.label}
          </span>
        );
      })}
    </span>
  );
}
