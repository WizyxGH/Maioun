/**
 * « EFFACER TOUT » EFFACE CE QU'IL MONTRE. La barre ne montrait que les filtres
 * rapides : la recherche texte, les sources retenues et les bascules
 * restreignaient la liste sans apparaître, et le lien les laissait en place —
 * on effaçait « tout » sans que la liste bouge.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EMPTY_QUICK_FILTERS, QuickFilters } from './QuickFilters.js';

describe('barre des filtres posés', () => {
  it('montre les restrictions venues d’ailleurs, et les retire une à une', () => {
    const retirer = vi.fn();
    render(
      <QuickFilters
        values={EMPTY_QUICK_FILTERS}
        onChange={vi.fn()}
        extras={[{ label: 'Sauf LocService', onRemove: retirer }]}
      />,
    );
    expect(screen.getByText('Sauf LocService')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sauf LocService/ }));
    expect(retirer).toHaveBeenCalled();
  });

  it('efface tout d’un geste, y compris ce qui ne vient pas d’ici', () => {
    const toutEffacer = vi.fn();
    const onChange = vi.fn();
    render(
      <QuickFilters
        values={{ ...EMPTY_QUICK_FILTERS, maxPrice: 700 }}
        onChange={onChange}
        extras={[{ label: '« studio »', onRemove: vi.fn() }]}
        onClearAll={toutEffacer}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Effacer tout' }));
    expect(toutEffacer).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('s’affiche même sans filtre rapide, dès qu’une autre restriction existe', () => {
    render(
      <QuickFilters
        values={EMPTY_QUICK_FILTERS}
        onChange={vi.fn()}
        extras={[{ label: 'Favoris uniquement', onRemove: vi.fn() }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Effacer tout' })).toBeInTheDocument();
  });
});
