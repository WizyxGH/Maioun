import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MultiSelect } from './multi-select.js';

const options = [
  { value: 'cimiez', label: 'Cimiez (12)' },
  { value: 'nice-nord', label: 'Nice Nord (8)' },
  { value: 'nord-est', label: 'Nord-Est (3)' },
  { value: 'port', label: 'Port (5)' },
];

function open(props: Partial<Parameters<typeof MultiSelect>[0]> = {}) {
  const onClear = vi.fn();
  const onSelectMany = vi.fn();
  render(
    <MultiSelect
      label="Quartiers"
      options={options}
      selected={new Set<string>()}
      onToggle={vi.fn()}
      onClear={onClear}
      onSelectMany={onSelectMany}
      searchable
      emptyLabel="Tous les quartiers"
      {...props}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Quartiers/ }));
  return { onClear, onSelectMany };
}

describe('MultiSelect — tout sélectionner, tout retirer', () => {
  it('coche « Tous les quartiers » quand rien ne restreint, et y revient d’un clic', () => {
    const { onClear } = open({ selected: new Set(['port']) });
    const all = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Tous les quartiers' });
    expect(all.checked).toBe(false);
    expect(all.indeterminate).toBe(true);
    fireEvent.click(all);
    expect(onClear).toHaveBeenCalled();
  });

  it('coche, puis décoche, tous les résultats d’une recherche d’un geste', () => {
    const { onSelectMany } = open();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nord' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cocher les 2 résultats' }));
    expect(onSelectMany).toHaveBeenCalledWith(['nice-nord', 'nord-est'], true);
  });

  it('propose de décocher quand tous les résultats le sont déjà', () => {
    const { onSelectMany } = open({ selected: new Set(['nice-nord', 'nord-est']) });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nord' } });
    fireEvent.click(screen.getByRole('button', { name: 'Décocher les 2 résultats' }));
    expect(onSelectMany).toHaveBeenCalledWith(['nice-nord', 'nord-est'], false);
  });
});
