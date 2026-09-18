/**
 * LA BARRE BASSE N'A RIEN À DIRE DANS UN SOUS-ÉCRAN.
 *
 * Elle suivait partout : sur la fiche d'une annonce, sur celle d'une agence,
 * dans les réglages, sur l'écran d'une source. Aucun de ses quatre onglets ne
 * désignait la page ouverte — elle occupait le bas de l'écran pour indiquer
 * quatre endroits où l'on n'était pas, pendant que le « Retour » du haut, lui,
 * savait d'où l'on venait.
 *
 * Elle ne s'affiche donc plus que sur SES destinations, et c'est sa propre
 * table qui le décide (`bottomTabForRoute`) : un écran ajouté demain ne
 * l'aura pas sans y être inscrit. Ce qui compte pour l'utilisateur, et que
 * chaque cas vérifie ici : là où elle disparaît, une sortie reste.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App.js';
import { formatSourceName } from './format.js';

const FROZEN_NOW = Date.parse('2026-08-14T09:30:00.000Z');

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(FROZEN_NOW);
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

/** La barre basse, ou `null` — son intitulé exact, « Navigation ». */
function bottomNav(): HTMLElement | null {
  return screen.queryByRole('navigation', { name: 'Navigation' });
}

/**
 * Une sortie existe-t-elle sur cet écran ? Sinon, c'est un cul-de-sac.
 *
 * ELLE S'ATTEND. Les écrans secondaires sont chargés à la demande : leur
 * fragment arrive APRÈS que la barre basse a disparu, si bien qu'un contrôle
 * immédiat tombait sur une coquille vide — ce qui a fini par rougir
 * l'intégration continue sans qu'aucune sortie ait été perdue.
 */
async function hasWayOut(): Promise<boolean> {
  await screen.findByRole('button', { name: 'Retour' });
  return true;
}

describe('la barre basse ne suit que ses quatre destinations', () => {
  it('est là sur la recherche, et plus sur la fiche qu’on y ouvre', async () => {
    const user = userEvent.setup();
    render(<App />);
    const tabs = await screen.findAllByRole('button', { name: 'Recherche' });
    await user.click(tabs[0]!);
    expect(bottomNav()).not.toBeNull();

    const cards = await screen.findAllByTestId('listing-card');
    await user.click(cards[0]!);

    await waitFor(() => expect(bottomNav()).toBeNull());
    // Et la fiche garde sa sortie : sans barre NI retour, on y resterait.
    expect(await hasWayOut()).toBe(true);
  });

  it('est là sur les Paramètres, et plus dans leurs sous-écrans', async () => {
    const user = userEvent.setup();
    render(<App />);
    const reglages = await screen.findAllByRole('button', { name: 'Paramètres' });
    await user.click(reglages[0]!);
    expect(bottomNav()).not.toBeNull();

    await user.click(await screen.findByText('Sources'));
    await screen.findByText('État des sources');

    expect(bottomNav()).toBeNull();
    expect(await hasWayOut()).toBe(true);
  });

  it('ni sur l’écran d’une source, deux niveaux plus bas', async () => {
    const user = userEvent.setup();
    render(<App />);
    const reglages = await screen.findAllByRole('button', { name: 'Paramètres' });
    await user.click(reglages[0]!);
    await user.click(await screen.findByText('Sources'));
    await user.click(await screen.findByRole('button', { name: formatSourceName('demo-agence') }));

    await waitFor(() => expect(bottomNav()).toBeNull());
    expect(await hasWayOut()).toBe(true);
  });

  it('reste sur l’accueil et sur les favoris, qui sont bien des destinations', async () => {
    const user = userEvent.setup();
    render(<App />);
    // L'accueil, écran d'arrivée.
    expect(bottomNav()).not.toBeNull();

    const favoris = await screen.findAllByRole('button', { name: 'Favoris' });
    await user.click(favoris[0]!);

    await waitFor(() => expect(window.location.pathname).toBe('/favorites'));
    expect(bottomNav()).not.toBeNull();
  });

  it('même arrivé par un lien direct sur une fiche, elle ne s’affiche pas', async () => {
    // La profondeur d'historique ne pouvait pas servir de critère : ici elle
    // vaut zéro, comme sur l'accueil. C'est l'ÉCRAN qui décide, pas le chemin
    // parcouru pour y venir.
    window.history.replaceState({}, '', '/sources/demo-agence');
    render(<App />);
    expect(await screen.findByText(formatSourceName('demo-agence'))).toBeInTheDocument();

    expect(bottomNav()).toBeNull();
    expect(await hasWayOut()).toBe(true);
  });
});
