/**
 * Le filet doit attraper, DIRE, et laisser une sortie.
 *
 * Sans lui, une annonce dont un champ manquait vidait tout l'écran : ni
 * message, ni bord de page, ni bouton de retour. Recharger n'y changeait rien —
 * la même donnée relançait la même erreur.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary.js';

function Boom(): React.JSX.Element {
  throw new Error('champ absent : description');
}

describe('ErrorBoundary', () => {
  /**
   * React RELANCE l'erreur après l'avoir attrapée, pour que les outils de
   * développement la voient. Dans un processus de test isolé, cette relance
   * n'est rattrapée par personne et TUE le processus : la suite passait seule et
   * mourait dans le lot, une fois sur deux. On l'intercepte donc ici, sans rien
   * masquer — le composant a déjà fait son travail quand elle arrive.
   */
  const swallow = (event: ErrorEvent): void => event.preventDefault();

  beforeEach(() => {
    window.addEventListener('error', swallow);
    // React écrit l'erreur lui-même ; on tait le bruit sans masquer le nôtre.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    window.removeEventListener('error', swallow);
    vi.restoreAllMocks();
  });

  it('laisse passer ce qui s’affiche normalement', () => {
    render(
      <ErrorBoundary onHome={() => {}}>
        <p>Contenu</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Contenu')).toBeInTheDocument();
  });

  it('remplace l’écran vide par un message et deux sorties', () => {
    render(
      <ErrorBoundary onHome={() => {}}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/n’a pas pu s’afficher/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accueil/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recharger/i })).toBeInTheDocument();
  });

  /** Le détail technique est ce qu'on recopie pour faire corriger. */
  it('garde le message d’erreur, replié', () => {
    render(
      <ErrorBoundary onHome={() => {}}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('champ absent : description')).toBeInTheDocument();
  });

  it('rend la main à l’appelant', async () => {
    const user = userEvent.setup();
    const onHome = vi.fn();
    render(
      <ErrorBoundary onHome={onHome}>
        <Boom />
      </ErrorBoundary>,
    );
    await user.click(screen.getByRole('button', { name: /accueil/i }));
    expect(onHome).toHaveBeenCalledOnce();
  });
});
