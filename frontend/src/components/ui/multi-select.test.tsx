/**
 * EXCLURE UNE SOURCE. Le menu ne savait qu'inclure : cocher LocService donnait
 * « seulement LocService », soit l'inverse du geste voulu.
 *
 * Y figure aussi la sélection en bloc d'une recherche, qui sert aux quartiers.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MultiSelect } from './multi-select.js';

const options = [
  { value: 'locservice', label: 'LocService' },
  { value: 'foncia', label: 'Foncia' },
  { value: 'orpi', label: 'Orpi' },
];

const quartiers = [
  { value: 'cimiez', label: 'Cimiez (12)' },
  { value: 'nice-nord', label: 'Nice Nord (8)' },
  { value: 'nord-est', label: 'Nord-Est (3)' },
  { value: 'port', label: 'Port (5)' },
];

function ouvrir(selected: string[], handlers: Partial<Parameters<typeof MultiSelect>[0]> = {}) {
  const props = {
    label: 'Sources',
    options,
    selected: new Set(selected),
    onToggle: vi.fn(),
    onClear: vi.fn(),
    onSelectMany: vi.fn(),
    emptyLabel: 'Toutes',
    ...handlers,
  };
  render(<MultiSelect {...props} />);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(props.label) }));
  return props;
}

describe('menu à choix multiples', () => {
  it('décocher « Toutes » coche tout le reste, de quoi en retirer une', () => {
    const props = ouvrir([]);
    fireEvent.click(screen.getByLabelText('Toutes'));
    expect(props.onSelectMany).toHaveBeenCalledWith(['locservice', 'foncia', 'orpi'], true);
  });

  it('nomme ce qui est exclu plutôt que de compter ce qui reste', () => {
    ouvrir(['foncia', 'orpi']);
    expect(screen.getByRole('button', { name: /Sources/ }).textContent).toContain(
      'Sauf LocService',
    );
  });

  it('coche, puis décoche, tous les résultats d’une recherche d’un geste', () => {
    const props = ouvrir([], { label: 'Quartiers', options: quartiers, searchable: true });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nord' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cocher les 2 résultats' }));
    expect(props.onSelectMany).toHaveBeenCalledWith(['nice-nord', 'nord-est'], true);
  });

  it('propose de décocher quand tous les résultats le sont déjà', () => {
    const props = ouvrir(['nice-nord', 'nord-est'], {
      label: 'Quartiers',
      options: quartiers,
      searchable: true,
    });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nord' } });
    fireEvent.click(screen.getByRole('button', { name: 'Décocher les 2 résultats' }));
    expect(props.onSelectMany).toHaveBeenCalledWith(['nice-nord', 'nord-est'], false);
  });

  it('« tout » est à moitié cochée dès qu’une sélection restreint la liste', () => {
    ouvrir(['foncia']);
    const tout = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Toutes' });
    expect(tout.checked).toBe(false);
    expect(tout.indeterminate).toBe(true);
  });

  // Les sources ont un MODE : les mêmes cases cochées veulent dire « seulement
  // celles-ci » ou « toutes sauf les autres ». Le résumé déduit d'ici annonçait
  // l'un pour l'autre, et la ligne « tout » se cochait alors qu'aucune source
  // n'était retenue.
  it('laisse l’appelant imposer le résumé et l’état de « tout »', () => {
    ouvrir([], { summary: 'Aucune source', allSelected: false });
    expect(screen.getByRole('button', { name: /Sources/ }).textContent).toContain('Aucune source');
    const tout = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Toutes' });
    expect(tout.checked).toBe(false);
    expect(tout.indeterminate).toBe(false);
  });

  it('tout recocher revient à « toutes », sans liste à rallonge', () => {
    const props = ouvrir(['foncia', 'orpi']);
    fireEvent.click(screen.getByLabelText('LocService'));
    expect(props.onClear).toHaveBeenCalled();
    expect(props.onToggle).not.toHaveBeenCalled();
  });
});
