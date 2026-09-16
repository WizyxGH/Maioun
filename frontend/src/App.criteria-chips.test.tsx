/**
 * « POURQUOI SEULEMENT 3 FILTRES ? » — relevé du 2026-09-16.
 *
 * La pastille du bouton « Filtres » et la barre de puces ne montraient que les
 * filtres du navigateur. Les CRITÈRES — 87 quartiers, deux exclusions, un
 * plafond de trajet — restreignaient la liste côté serveur sans apparaître
 * nulle part, et « Effacer tout » les laissait en place sans le dire.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NICE_DISTRICTS } from '@maioun/shared';
import type * as Client from './api/client.js';
import type { FilterConfig } from './types.js';

const state = vi.hoisted(() => ({
  criteria: {} as FilterConfig,
  saved: [] as FilterConfig[],
  listingCalls: 0,
}));

vi.mock('./api/client.js', async (original) => {
  const actual = await original<typeof Client>();
  return {
    ...actual,
    fetchFilters: () => Promise.resolve(state.criteria),
    saveFilters: (filters: FilterConfig) => {
      state.saved.push(filters);
      state.criteria = filters;
      return Promise.resolve(filters);
    },
    fetchListings: (options: Client.FetchListingsOptions = {}) => {
      state.listingCalls += 1;
      return actual.fetchListings(options);
    },
  };
});

const { App } = await import('./App.js');

/** Les critères du compte, tels qu'ils sont enregistrés aujourd'hui. */
const ACCOUNT_CRITERIA: FilterConfig = {
  cities: ['nice'],
  minPrice: 250,
  maxPrice: 700,
  minArea: 20,
  maxCommuteMinutes: 60,
  excludeFlatShare: true,
  excludeStudent: true,
  landlordFilter: 'all',
  districts: NICE_DISTRICTS.slice(0, 87).map((district) => district.slug),
};

async function openSearch(): Promise<void> {
  render(<App />);
  const tabs = await screen.findAllByRole('button', { name: 'Recherche' });
  await userEvent.click(tabs[0]!);
}

describe('les critères comptent dans la barre de filtres', () => {
  beforeEach(() => {
    localStorage.clear();
    state.criteria = { ...ACCOUNT_CRITERIA };
    state.saved.length = 0;
    state.listingCalls = 0;
  });

  it('affiche une puce par critère, et la pastille les compte tous', async () => {
    await openSearch();

    // Les critères, qui ne se voyaient nulle part.
    expect(await screen.findByText('87 quartiers')).toBeInTheDocument();
    expect(screen.getByText('Trajet ≤ 60 min')).toBeInTheDocument();
    expect(screen.getByText('Sans colocations')).toBeInTheDocument();
    expect(screen.getByText('Sans logements étudiants')).toBeInTheDocument();

    // Deux filtres rapides (budget, surface) + quatre critères = six, et non
    // huit : budget et surface existent des deux côtés et ne comptent qu'une
    // fois.
    const button = screen.getAllByRole('button', { name: 'Filtres' })[0]!;
    expect(within(button).getByText('6')).toBeInTheDocument();
    expect(screen.getAllByText(/250 – 700 €/)).toHaveLength(1);
    expect(screen.getAllByText('≥ 20 m²')).toHaveLength(1);
  });

  it('montre les quartiers sans prétendre les retirer d’un clic', async () => {
    await openSearch();
    await screen.findByText('87 quartiers');

    expect(screen.queryByRole('button', { name: /Retirer le filtre 87 quartiers/ })).toBeNull();
    // La puce dit où se règle ce qu'elle ne défait pas.
    expect(screen.getAllByText('à régler dans Filtres').length).toBeGreaterThan(0);
  });

  it('retire une exclusion en écrivant le critère, puis recharge la liste', async () => {
    await openSearch();
    await screen.findByText('Sans colocations');
    const before = state.listingCalls;

    await userEvent.click(
      screen.getByRole('button', { name: /Retirer le filtre Sans colocations/ }),
    );

    await waitFor(() => expect(state.saved).toHaveLength(1));
    expect(state.saved[0]?.excludeFlatShare).toBe(false);
    // Les autres critères survivent au retrait d'un seul.
    expect(state.saved[0]?.districts).toHaveLength(87);
    expect(state.saved[0]?.excludeStudent).toBe(true);
    await waitFor(() => expect(state.listingCalls).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByText('Sans colocations')).toBeNull());
  });

  it('dit que « Effacer tout » ne touche pas aux critères — et le tient', async () => {
    await openSearch();
    await screen.findByText('Sans colocations');
    expect(screen.getByText(/ne touche qu’à l’affichage/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Effacer tout' }));

    // L'affichage est effacé, les critères restent — et rien n'a été écrit.
    expect(screen.queryByText(/250 – 700 €/)).toBeNull();
    expect(screen.getByText('Sans colocations')).toBeInTheDocument();
    expect(screen.getByText('87 quartiers')).toBeInTheDocument();
    expect(state.saved).toHaveLength(0);
  });
});
