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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

/**
 * ET LE CAS INVERSE, qui n'était pas couvert : une installation qui A branché
 * Google. Les trois épreuves ci-dessus prouvent que rien ne s'affiche sans
 * identifiant — elles passeraient tout aussi bien si le bouton ne s'affichait
 * JAMAIS. C'est ce chemin-là qui s'allume le jour où l'identifiant arrive.
 *
 * L'identifiant est lu au chargement du module : on le pose AVANT d'importer
 * le composant, et on redemande les modules pour que la constante soit relue.
 */
describe('GoogleSignIn, une fois configuré', () => {
  const CLIENT_ID = 'exemple.apps.googleusercontent.com';

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    delete (globalThis as { google?: unknown }).google;
  });

  /** La bibliothèque de Google, déjà « chargée » : jsdom n'exécute pas son script. */
  function libraryStub(): {
    initialize: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
  } {
    const initialize = vi.fn();
    const render = vi.fn();
    (globalThis as { google?: unknown }).google = {
      accounts: { id: { initialize, renderButton: render } },
    };
    return { initialize, render };
  }

  it('affiche le bouton et le confie à Google', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', CLIENT_ID);
    const { initialize, render: renderButton } = libraryStub();
    vi.resetModules();
    const { GoogleSignIn: Configure } = await import('./GoogleSignIn.js');

    render(<Configure onSignedIn={vi.fn()} onError={vi.fn()} />);

    const slot = await screen.findByTestId('google-signin');
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    // L'identifiant part bien à Google : c'est lui qui décide à quelle
    // application le jeton est destiné, et le Worker refuse les autres.
    expect(initialize.mock.calls[0]?.[0]).toMatchObject({ client_id: CLIENT_ID });
    expect(renderButton.mock.calls[0]?.[0]).toBe(slot);
  });

  it('se retire si la bibliothèque ne répond pas', async () => {
    // Réseau coupé, extension qui bloque : mieux vaut aucun bouton qu'un
    // bouton qui ne fait rien — le mot de passe, lui, marche toujours.
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', CLIENT_ID);
    vi.resetModules();
    const { GoogleSignIn: Configure } = await import('./GoogleSignIn.js');

    render(<Configure onSignedIn={vi.fn()} onError={vi.fn()} />);
    const script = document.querySelector('script[src*="accounts.google.com"]');
    expect(script).not.toBeNull();
    script?.dispatchEvent(new Event('error'));

    await waitFor(() => expect(screen.queryByTestId('google-signin')).not.toBeInTheDocument());
  });
});
