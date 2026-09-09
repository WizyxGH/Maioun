/**
 * LE BOUTON NE DOIT PAS EXISTER S'IL NE PEUT PAS MARCHER (§17).
 *
 * Un « Continuer avec Google » qui échoue au clic est pire que son absence :
 * on croit à une panne du service, on réessaie, et on finit par renoncer sans
 * voir le formulaire de mot de passe qui, lui, fonctionne.
 *
 * Les tests tournent sans identifiant d'application configuré — le cas d'une
 * installation qui n'a pas branché Google, et celui du dépôt tel qu'il est
 * livré.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GoogleSignIn } from './GoogleSignIn.js';

describe('GoogleSignIn', () => {
  it('n’affiche rien quand la connexion Google n’est pas configurée', () => {
    render(<GoogleSignIn onSignedIn={vi.fn()} onError={vi.fn()} />);
    expect(screen.queryByTestId('google-signin')).not.toBeInTheDocument();
  });

  it('ne va PAS chercher la bibliothèque de Google pour rien', () => {
    // Sans identifiant d'application, charger le script apprendrait à Google
    // qu'une page a été ouverte, pour un bouton qui ne s'affichera pas (§26).
    const before = document.querySelectorAll('script[src*="accounts.google.com"]').length;
    render(<GoogleSignIn onSignedIn={vi.fn()} onError={vi.fn()} />);
    expect(document.querySelectorAll('script[src*="accounts.google.com"]')).toHaveLength(before);
  });

  it('ne prévient ni de succès ni d’échec tant que rien n’a été tenté', () => {
    const onSignedIn = vi.fn();
    const onError = vi.fn();
    render(<GoogleSignIn onSignedIn={onSignedIn} onError={onError} />);
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
