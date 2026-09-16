/**
 * LE FILTRE PAR SOURCE, DANS LA MODALE.
 *
 * Deux défauts se voyaient ici : le menu ne proposait que les sources ayant une
 * annonce du jour — on ne pouvait donc pas en écarter une d'avance —, et son
 * résumé se déduisait des cases cochées, sans savoir si elles voulaient dire
 * « seulement » ou « sauf ».
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SortFilterModal } from './SortFilterModal.js';
import { ALL_SOURCES, type SourceSelection } from '../source-selection.js';
import { DEFAULT_QUICK_FILTERS } from './QuickFilters.js';

// La modale charge la répartition des loyers, et son repli de critères parle à
// l'API : ni l'une ni l'autre ne concerne les sources.
vi.mock('../api/client.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  fetchPriceHistogram: vi.fn().mockResolvedValue(null),
}));
vi.mock('./FiltersPanel.js', () => ({ FiltersPanel: () => null }));

function ouvrir(sourceFilter: SourceSelection = ALL_SOURCES) {
  const onSourceFilterChange = vi.fn();
  render(
    <SortFilterModal
      open
      onClose={vi.fn()}
      toggles={[]}
      quickFilters={DEFAULT_QUICK_FILTERS}
      onQuickFiltersChange={vi.fn()}
      availableTypes={[]}
      sources={['orpi', 'locservice', 'agence-sans-annonce']}
      sourceCounts={new Map([['orpi', 12]])}
      sourceFilter={sourceFilter}
      onSourceFilterChange={onSourceFilterChange}
      resultCount={12}
      onReset={vi.fn()}
      dirty={false}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Sources/ }));
  return onSourceFilterChange;
}

describe('le menu des sources', () => {
  it('propose aussi les sources sans annonce du jour, avec leur « 0 »', () => {
    ouvrir();
    expect(screen.getByLabelText('Orpi (12)')).toBeInTheDocument();
    // Sans elle, impossible d'écarter d'avance une agence qui publiera demain.
    expect(screen.getByLabelText('Agence Sans Annonce (0)')).toBeInTheDocument();
  });

  it('décocher une source l’EXCLUT, sans figer la liste des autres', () => {
    const onChange = ouvrir();
    fireEvent.click(screen.getByLabelText('LocService (0)'));
    expect(onChange).toHaveBeenCalledWith({ mode: 'except', ids: new Set(['locservice']) });
  });

  it('le résumé et le sort des sources à venir suivent le mode', () => {
    ouvrir({ mode: 'except', ids: new Set(['locservice']) });
    expect(screen.getByRole('button', { name: /Sources/ }).textContent).toContain(
      'Sauf LocService',
    );
    expect(screen.getByText(/ajoutées plus tard s’afficheront aussi/)).toBeInTheDocument();
  });

  it('en mode « seulement », le résumé le dit et annonce l’exclusion des suivantes', () => {
    ouvrir({ mode: 'only', ids: new Set(['orpi']) });
    expect(screen.getByRole('button', { name: /Sources/ }).textContent).toContain('Seulement Orpi');
    expect(screen.getByText(/ajoutées plus tard ne s’afficheront pas/)).toBeInTheDocument();
  });

  it('changer de mode repart d’une liste vide, et non d’une photographie', () => {
    const onChange = ouvrir({ mode: 'except', ids: new Set(['locservice']) });
    fireEvent.click(screen.getByRole('button', { name: 'Seulement…' }));
    expect(onChange).toHaveBeenCalledWith({ mode: 'only', ids: new Set() });
  });
});
