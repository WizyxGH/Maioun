/**
 * UN SEUL ÉCRAN DE CONNEXION, et non deux.
 *
 * Il y en avait un premier — « Connectez-vous pour continuer », avec un bouton
 * « Se connecter » — devant celui qui porte le formulaire. Deux écrans pour le
 * même geste, et le premier n'apportait qu'une phrase : le nom de ce qu'on
 * venait faire. Cette phrase tient dans le second.
 *
 * CE QUI NE DOIT PAS SE PERDRE dans la fusion : le nom du geste tenté, et la
 * sortie vers le catalogue — cet écran occupe tout, barre de navigation
 * comprise, et consulter reste libre.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from './LoginScreen.js';

vi.mock('../api/client.js', () => ({ login: vi.fn() }));
vi.mock('./GoogleSignIn.js', () => ({ GoogleSignIn: () => null }));
vi.mock('./Turnstile.js', () => ({ Turnstile: () => null }));

describe('LoginScreen', () => {
  it('nomme le geste qu’on venait faire', () => {
    render(<LoginScreen onSignedIn={vi.fn()} raison="garder une annonce en favori" />);
    expect(
      screen.getByText('Connectez-vous pour garder une annonce en favori.'),
    ).toBeInTheDocument();
  });

  it('reste générique quand aucun geste n’est en attente', () => {
    render(<LoginScreen onSignedIn={vi.fn()} />);
    expect(screen.getByText('Connectez-vous pour voir vos annonces.')).toBeInTheDocument();
  });

  // CONSULTER RESTE LIBRE : sans cette sortie, on est coincé sur l'écran.
  it('laisse revenir aux annonces sans compte', async () => {
    const onBack = vi.fn();
    render(<LoginScreen onSignedIn={vi.fn()} onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: /revenir aux annonces/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('n’affiche pas de sortie quand il n’y en a pas', () => {
    render(<LoginScreen onSignedIn={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /revenir aux annonces/i })).toBeNull();
  });

  // La création de compte était la porte principale du premier écran : elle
  // doit rester une porte, pas un lien discret.
  it('propose toujours de créer un compte', async () => {
    const onSignup = vi.fn();
    render(<LoginScreen onSignedIn={vi.fn()} onSignup={onSignup} />);
    await userEvent.click(screen.getByRole('button', { name: /créer un compte/i }));
    expect(onSignup).toHaveBeenCalledTimes(1);
  });
});
