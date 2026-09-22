/**
 * LA PASTILLE DE LA CLOCHE EST ROUGE.
 *
 * Elle empruntait `--color-hot`, l'orange qui signale une annonce à contacter
 * d'urgence : deux idées sans rapport dans la même teinte, sur le même écran.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertBell } from './AlertBell.js';

describe('la cloche des notifications', () => {
  it('porte la couleur « non lu », et non celle des annonces urgentes', () => {
    render(<AlertBell unread={3} onOpen={vi.fn()} />);
    const pastille = screen.getByTestId('alert-badge');
    expect(pastille.className).toContain('bg-notify');
    expect(pastille.className).not.toContain('bg-hot');
  });

  it('n’affiche rien quand tout est lu', () => {
    render(<AlertBell unread={0} onOpen={vi.fn()} />);
    expect(screen.queryByTestId('alert-badge')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('dit le nombre de non-lues aux lecteurs d’écran', () => {
    render(<AlertBell unread={3} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Notifications, 3 non lues' })).toBeInTheDocument();
  });
});
