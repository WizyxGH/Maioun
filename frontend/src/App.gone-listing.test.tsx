/**
 * Une carte qui ne mène nulle part.
 *
 * Signalé le 2026-09-16 : « je vois encore 1 annonce à vérifier, mais quand je
 * clique sur sa carte ça me dit annonce introuvable ». Deux cas se cachaient
 * derrière : l'annonce a été absorbée par une fusion et vit sous un autre
 * identifiant, ou elle a vraiment disparu — et la liste continuait de la
 * compter dans les deux cas.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Client from './api/client.js';
import type { ListingView } from './types.js';

const ABSENT = 'demo:3';

const behaviour = vi.hoisted(() => ({
  fiche: null as ((id: string) => Promise<ListingView>) | null,
}));

vi.mock('./api/client.js', async (original) => {
  const actual = await original<typeof Client>();
  const { MOCK_LISTINGS } = await import('./api/mock-data.js');
  return {
    ...actual,
    // La liste ne transporte qu'une version ALLÉGÉE des fiches, comme l'API :
    // c'est ce qui oblige l'écran de fiche à redemander la complète. Une des
    // annonces est « à vérifier » — c'est elle qu'on ira ouvrir.
    fetchListings: () => {
      const listings = MOCK_LISTINGS.filter((one) => one.matchesCriteria).map((one) => ({
        ...one,
        partial: true,
        ...(one.id === ABSENT ? { lifecycle: 'possiblyInactive' as const } : {}),
      }));
      return Promise.resolve({
        listings,
        total: listings.length,
        limit: listings.length,
        offset: 0,
      });
    },
    fetchListing: (id: string) =>
      behaviour.fiche === null ? actual.fetchListing(id) : behaviour.fiche(id),
    markViewed: () => Promise.resolve(),
  };
});

const { App } = await import('./App.js');
const { ApiError } = await import('./api/client.js');
const { MOCK_LISTINGS } = await import('./api/mock-data.js');

/** La carte de l'annonce « à vérifier ». */
async function carteAVerifier(): Promise<HTMLElement> {
  const cards = await screen.findAllByTestId('listing-card');
  const found = cards.find((card) => card.textContent?.includes('Peut-être retirée'));
  expect(found).toBeDefined();
  return found!;
}

async function ouvrirLaRecherche(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  render(<App />);
  const tabs = await screen.findAllByRole('button', { name: 'Recherche' });
  await user.click(tabs[0]!);
  return user;
}

beforeEach(() => {
  behaviour.fiche = null;
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

describe('une annonce que la fiche ne sait plus servir', () => {
  it('la retire de la liste et des décomptes, et dit quoi faire', async () => {
    behaviour.fiche = () => Promise.reject(new ApiError('Annonce introuvable', 404));
    const user = await ouvrirLaRecherche();
    expect(await screen.findByText(/1 à vérifier/)).toBeInTheDocument();

    await user.click(await carteAVerifier());

    expect(await screen.findByText(/n’est plus en ligne/)).toBeInTheDocument();
    // Le décompte suit : plus rien « à vérifier », et une carte de moins.
    await waitFor(() => expect(screen.queryByText(/à vérifier/)).not.toBeInTheDocument());
    const cards = await screen.findAllByTestId('listing-card');
    expect(cards).toHaveLength(MOCK_LISTINGS.filter((one) => one.matchesCriteria).length - 1);
  });

  it('suit l’annonce quand une fusion lui a donné un autre identifiant', async () => {
    const heritiere = MOCK_LISTINGS.find((one) => one.id === 'demo:2')!;
    behaviour.fiche = () => Promise.resolve({ ...heritiere, id: 'demo:2' });
    const user = await ouvrirLaRecherche();
    await screen.findByText(/1 à vérifier/);

    await user.click(await carteAVerifier());

    // La fiche s'ouvre sur celle qui a absorbé l'annonce, et l'adresse le dit.
    expect(await screen.findByRole('button', { name: 'Ajouter aux favoris' })).toBeInTheDocument();
    await waitFor(() => expect(decodeURIComponent(window.location.pathname)).toContain('demo:2'));
    expect(screen.queryByText(/introuvable/)).not.toBeInTheDocument();
  });
});
