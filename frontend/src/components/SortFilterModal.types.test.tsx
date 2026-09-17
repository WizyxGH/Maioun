/**
 * LE CHOIX « TYPE DE BIEN », DANS LA MODALE.
 *
 * Il se déduisait des annonces chargées. Comme la liste arrive en deux temps —
 * cinquante d'abord, tout ensuite —, les choix changeaient sous les doigts une
 * seconde après l'ouverture : un type absent du premier lot n'apparaissait
 * qu'après. Et rien ne disait pourquoi stationnements et locaux professionnels
 * n'y figuraient jamais.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SortFilterModal } from './SortFilterModal.js';
import { ALL_SOURCES } from '../source-selection.js';
import { DEFAULT_QUICK_FILTERS } from './QuickFilters.js';
import type { PropertyType } from '@maioun/shared';

vi.mock('../api/client.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  fetchPriceHistogram: vi.fn().mockResolvedValue(null),
}));
vi.mock('./FiltersPanel.js', () => ({ FiltersPanel: () => null }));

function ouvrir(types: ReadonlySet<PropertyType> = new Set()) {
  render(
    <SortFilterModal
      open
      onClose={vi.fn()}
      toggles={[]}
      quickFilters={{ ...DEFAULT_QUICK_FILTERS, types }}
      onQuickFiltersChange={vi.fn()}
      sources={['orpi']}
      sourceFilter={ALL_SOURCES}
      onSourceFilterChange={vi.fn()}
      resultCount={12}
      onReset={vi.fn()}
      dirty={false}
    />,
  );
}

/** Les pilules du bloc « Type de bien », dans leur ordre d'affichage. */
function pilules(): readonly string[] {
  const bloc = screen.getByText('Type de bien').closest('fieldset');
  return [...(bloc?.querySelectorAll('button') ?? [])].map((b) => b.textContent ?? '');
}

describe('le choix du type de bien', () => {
  it('propose les mêmes types quelle que soit la liste chargée', () => {
    ouvrir();
    expect(pilules()).toEqual([
      'Tous',
      'Appartement',
      'Studio',
      'Maison',
      'Chambre',
      'Loft',
      'Autre',
    ]);
  });

  it('ne propose ni stationnement ni local professionnel, et dit pourquoi', () => {
    ouvrir();
    expect(pilules()).not.toContain('Stationnement');
    expect(pilules()).not.toContain('Local professionnel');
    expect(pilules()).not.toContain('Type inconnu');
    expect(
      screen.getByText(/stationnements et les locaux professionnels ne sont jamais listés/),
    ).toBeInTheDocument();
  });

  it('garde un type retenu qui ne serait plus proposé, pour qu’il se retire', () => {
    // Une recherche enregistrée avant ce réglage : le filtre s'applique, il
    // doit donc rester visible et décochable ici.
    ouvrir(new Set<PropertyType>(['parking']));
    expect(pilules()).toContain('Stationnement');
  });
});
