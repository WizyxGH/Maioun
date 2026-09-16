/**
 * EXCLURE UNE SOURCE. Le menu ne savait qu'inclure : cocher LocService donnait
 * « seulement LocService », soit l'inverse du geste voulu.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MultiSelect } from './multi-select.js';

const options = [
  { value: 'locservice', label: 'LocService' },
  { value: 'foncia', label: 'Foncia' },
  { value: 'orpi', label: 'Orpi' },
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
  fireEvent.click(screen.getByRole('button', { name: /Sources/ }));
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

  it('tout recocher revient à « toutes », sans liste à rallonge', () => {
    const props = ouvrir(['foncia', 'orpi']);
    fireEvent.click(screen.getByLabelText('LocService'));
    expect(props.onClear).toHaveBeenCalled();
    expect(props.onToggle).not.toHaveBeenCalled();
  });
});
