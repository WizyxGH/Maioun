/**
 * L'écran qu'on rencontre en voulant agir sans compte : le geste tenté dans
 * le titre, la connexion en principal, la création en second, et une sortie
 * discrète quand il y en a une.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountRequired } from './AccountRequired.js';

describe('AccountRequired', () => {
  it('nomme le geste qui a mené ici dans le titre', () => {
    render(
      <AccountRequired
        action="garder une annonce en favori"
        onLogin={vi.fn()}
        onSignup={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Connectez-vous pour garder une annonce en favori' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /connectez-vous/i })).toBeInTheDocument();
  });

  it('garde un titre générique sans geste nommé', () => {
    render(<AccountRequired onLogin={vi.fn()} onSignup={vi.fn()} />);
    expect(
      screen.getByRole('heading', { name: 'Connectez-vous pour continuer' }),
    ).toBeInTheDocument();
  });

  it('propose la connexion en principal et la création en second', async () => {
    const onLogin = vi.fn();
    const onSignup = vi.fn();
    render(<AccountRequired onLogin={onLogin} onSignup={onSignup} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Se connecter',
      'Créer un compte',
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(onLogin).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole('button', { name: 'Créer un compte' }));
    expect(onSignup).toHaveBeenCalledOnce();
  });

  it('laisse repartir sans compte quand un retour est proposé', async () => {
    const onBack = vi.fn();
    render(<AccountRequired onLogin={vi.fn()} onSignup={vi.fn()} onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: /continuer sans compte/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('n’offre pas de porte de sortie quand il n’y en a pas', () => {
    render(<AccountRequired onLogin={vi.fn()} onSignup={vi.fn()} />);
    expect(
      screen.queryByRole('button', { name: /continuer sans compte/i }),
    ).not.toBeInTheDocument();
  });
});
