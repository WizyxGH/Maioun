/**
 * Une fiche ouverte par son adresse, par quelqu'un que l'application ne
 * reconnaît pas — le cas d'une notification tapée dans un contexte sans session.
 *
 * Signalé le 2026-09-11 : « les notifs web renvoient vers rien ». La garde du
 * chargement attendait de connaître l'utilisateur ET qu'il soit connecté ; pour
 * un visiteur sans session, la fiche n'était jamais demandée, et le squelette
 * tournait indéfiniment. Le scénario de bout en bout ne pouvait pas le voir :
 * il tourne en démonstration, où l'on est toujours connecté.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Tout le reste de la démonstration, sauf l'identité : ce visiteur-là n'a pas
// de session.
vi.mock('./api/client.js', async (original) => ({
  ...(await original<typeof import('./api/client.js')>()),
  requiresLogin: () => true,
  fetchCurrentUser: () => Promise.resolve(null),
}));

const { App } = await import('./App.js');

describe('fiche ouverte par son adresse, sans session', () => {
  it('va CHERCHER l’annonce au lieu d’attendre une connexion', async () => {
    // `demo:4` est hors critères : la liste ne la charge pas. Seul le
    // chargement par l'adresse peut l'afficher.
    window.history.pushState({}, '', '/listing/demo%3A4');
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Retour' }, { timeout: 4000 })).toBeTruthy();
  });
});
