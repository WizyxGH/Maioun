/**
 * « Retour » ramène d'où l'on vient.
 *
 * Signalé le 2026-09-16 : « le bouton retour a un mauvais comportement lorsque
 * l'on est sur la page d'une agence et qu'on y est allé depuis la page d'une
 * annonce : il renvoie vers la page Sources ». Chaque bouton choisissait une
 * destination FIXE, sans regarder par où l'on était passé — et il ne faisait
 * donc pas la même chose que le bouton « Précédent » du navigateur, juste à
 * côté.
 *
 * Les scénarios ci-dessous sont les trois entrées possibles sur une même page :
 * depuis une annonce, depuis la liste des sources, et par un lien direct — ce
 * dernier étant le seul cas où il n'y a rien derrière.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App.js';
import { formatSourceName } from './format.js';

const FROZEN_NOW = Date.parse('2026-08-14T09:30:00.000Z');

/** Le chemin affiché, identifiants décodés (`demo:1` voyage en `demo%3A1`). */
function path(): string {
  return decodeURIComponent(window.location.pathname);
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(FROZEN_NOW);
  localStorage.clear();
  // `replaceState` et non `pushState` : chaque test doit partir d'une entrée
  // sans profondeur, comme quelqu'un qui ouvre le site.
  window.history.replaceState({}, '', '/');
});

/** Ouvre la recherche, puis la première annonce. */
async function ouvrirUneAnnonce(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  render(<App />);
  const tabs = await screen.findAllByRole('button', { name: 'Recherche' });
  await user.click(tabs[0]!);
  const cards = await screen.findAllByTestId('listing-card');
  await user.click(cards[0]!);
  await waitFor(() => expect(path()).toContain('/listing/'));
  return user;
}

async function retour(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Retour' }));
}

describe('le bouton « Retour » suit le chemin parcouru', () => {
  it('ramène à l’annonce quand l’agence a été ouverte depuis sa fiche', async () => {
    const user = await ouvrirUneAnnonce();
    const annonce = path();

    // Le nom de l'agence, sur la fiche : il mène à sa page et à ses annonces.
    await user.click(await screen.findByTitle(/Voir .+ et ses annonces/));
    await waitFor(() => expect(path()).toContain('/sources/'));

    await retour(user);

    await waitFor(() => expect(path()).toBe(annonce));
  });

  it('ramène à l’agence quand on est passé par une de ses annonces', async () => {
    const user = await ouvrirUneAnnonce();

    await user.click(await screen.findByTitle(/Voir .+ et ses annonces/));
    await waitFor(() => expect(path()).toContain('/sources/'));
    const agence = path();

    // Une annonce du catalogue de l'agence : deux sauts depuis la première
    // fiche, et c'est bien l'agence qu'on doit retrouver.
    const cards = await screen.findAllByTestId('listing-card');
    await user.click(cards[0]!);
    await waitFor(() => expect(path()).toContain('/listing/'));

    await retour(user);

    await waitFor(() => expect(path()).toBe(agence));
  });

  it('ramène à l’état des sources quand on y est allé depuis cette liste', async () => {
    const user = userEvent.setup();
    render(<App />);
    const reglages = await screen.findAllByRole('button', { name: 'Paramètres' });
    await user.click(reglages[0]!);
    await user.click(await screen.findByText('Sources'));

    await user.click(await screen.findByRole('button', { name: formatSourceName('demo-agence') }));
    await waitFor(() => expect(path()).toBe('/sources/demo-agence'));

    await retour(user);

    await waitFor(() => expect(path()).toBe('/sources'));
    expect(await screen.findByText('État des sources')).toBeInTheDocument();
  });

  it('propose l’écran voisin quand on est arrivé par un lien direct', async () => {
    // Aucune entrée derrière celle-ci : revenir en arrière sortirait du site.
    window.history.replaceState({}, '', '/sources/demo-agence');
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText(formatSourceName('demo-agence'))).toBeInTheDocument();

    await retour(user);

    await waitFor(() => expect(path()).toBe('/sources'));
    expect(await screen.findByText('État des sources')).toBeInTheDocument();
  });
});
