/**
 * L'écran qu'on rencontre en voulant agir sans compte.
 *
 * Deux exigences, et elles se contredisent si on n'y prend pas garde : dire
 * qu'un compte est nécessaire, et ne pas donner l'impression que tout l'est.
 * Consulter reste libre, et l'écran doit le rappeler — sinon la demande passe
 * pour un mur à l'entrée.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountRequired } from './AccountRequired.js';

describe('AccountRequired', () => {
  it('rappelle le geste qui a mené ici', () => {
    // Une demande de compte qui ne dit pas son motif paraît surgir de nulle
    // part, juste après un clic dont on ne voit plus l'effet.
    render(
      <AccountRequired
        action="garder une annonce en favori"
        onLogin={vi.fn()}
        onSignup={vi.fn()}
      />,
    );
    expect(screen.getByTestId('account-required')).toHaveTextContent(
      'garder une annonce en favori',
    );
  });

  it('dit que consulter reste libre', () => {
    render(<AccountRequired onLogin={vi.fn()} onSignup={vi.fn()} />);
    expect(screen.getByTestId('account-required')).toHaveTextContent(/consulter les annonces/i);
  });

  it('propose les deux chemins, création et connexion', async () => {
    const onLogin = vi.fn();
    const onSignup = vi.fn();
    render(<AccountRequired onLogin={onLogin} onSignup={onSignup} />);

    await userEvent.click(screen.getByRole('button', { name: 'Créer un compte' }));
    expect(onSignup).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole('button', { name: /déjà un compte/i }));
    expect(onLogin).toHaveBeenCalledOnce();
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
