/**
 * TROIS ÉTATS, JAMAIS DEUX : en cours, chargé, échoué.
 *
 * Les panneaux confondaient l'échec avec l'un des deux autres, chacun à sa
 * façon — « Chargement… » qui ne partait jamais, bloc simplement absent,
 * échec déguisé en « rien à montrer ». De l'extérieur les trois se
 * ressemblent : rien ne bouge, rien n'explique, et surtout rien ne propose de
 * recommencer.
 *
 * Ces tests tiennent la règle sur les panneaux où elle avait cédé.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaidSourcesSection } from './PaidSourcesPanel.js';
import { StatsPanel } from './StatsPanel.js';
import { EchecDeChargement } from './EchecDeChargement.js';
import { clearSourceAccess, fetchSourceAccess, saveSourceAccess } from '../api/client.js';
import { fetchStats } from '../api/client.js';

vi.mock('../api/client.js', () => ({
  fetchSourceAccess: vi.fn(),
  saveSourceAccess: vi.fn(),
  clearSourceAccess: vi.fn(),
  fetchStats: vi.fn(),
}));

beforeEach(() => {
  // Les appels s’additionnent d’un test à l’autre sans cela, et « deux
  // lectures » en compterait trois.
  vi.clearAllMocks();
  vi.mocked(saveSourceAccess).mockResolvedValue(undefined as never);
  vi.mocked(clearSourceAccess).mockResolvedValue(undefined as never);
});

describe('EchecDeChargement', () => {
  it('nomme ce qui a manqué et propose de recommencer', async () => {
    const reessayer = vi.fn();
    render(<EchecDeChargement quoi="vos statistiques" onReessayer={reessayer} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/vos statistiques/i);
    await userEvent.click(screen.getByRole('button', { name: /réessayer/i }));
    expect(reessayer).toHaveBeenCalledTimes(1);
  });

  // Un bouton qui ne ferait rien vaut moins que pas de bouton.
  it('n’affiche pas de bouton quand il n’y a rien à relancer', () => {
    render(<EchecDeChargement quoi="vos accès" />);
    expect(screen.queryByRole('button', { name: /réessayer/i })).toBeNull();
  });
});

describe('PaidSourcesSection', () => {
  // LE CAS QUI A MOTIVÉ TOUT CECI : l'échec remettait l'état à sa valeur de
  // départ, et « Chargement… » restait à l'écran pour toujours.
  it('ne reste pas en chargement quand la lecture échoue', async () => {
    vi.mocked(fetchSourceAccess).mockRejectedValue(new Error('réseau'));
    render(<PaidSourcesSection />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/vos accès/i);
    expect(screen.queryByLabelText('Chargement')).toBeNull();
  });

  it('recharge vraiment quand on réessaie', async () => {
    vi.mocked(fetchSourceAccess).mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce({
      configured: false,
      login: null,
      available: true,
    });
    render(<PaidSourcesSection />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /réessayer/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /déclarer mon abonnement/i })).toBeInTheDocument(),
    );
    expect(fetchSourceAccess).toHaveBeenCalledTimes(2);
  });

  it('annonce l’attente aux lecteurs d’écran, plutôt qu’un texte muet', () => {
    vi.mocked(fetchSourceAccess).mockReturnValue(new Promise(() => undefined));
    render(<PaidSourcesSection />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });
});

describe('StatsPanel', () => {
  it('propose de recommencer au lieu d’une phrase sans issue', async () => {
    vi.mocked(fetchStats).mockRejectedValue(new Error('réseau'));
    render(<StatsPanel />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument();
  });
});
