/**
 * Un lien de recherche partagée ouvert sans session — une fenêtre privée.
 *
 * Signalé le 2026-09-15 : le squelette tournait sans fin. L'écran de la
 * recherche partagée ne se rendait qu'à un compte, et la liste ne se chargeait
 * pas pour un visiteur.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Client from './api/client.js';
import { encodeSearch } from './share-search.js';
import type { FetchListingsOptions } from './api/client.js';

const calls = vi.hoisted(() => ({ listings: [] as FetchListingsOptions[], saved: 0 }));

vi.mock('./api/client.js', async (original) => {
  const actual = await original<typeof Client>();
  return {
    ...actual,
    requiresLogin: () => true,
    fetchCurrentUser: () => Promise.resolve(null),
    fetchListings: (options: FetchListingsOptions = {}) => {
      calls.listings.push(options);
      return actual.fetchListings(options);
    },
    saveFilters: () => {
      calls.saved += 1;
      return Promise.reject(new Error('un visiteur n’écrit rien'));
    },
  };
});

const { App } = await import('./App.js');

const criteria = {
  cities: ['nice'],
  maxPrice: 650,
  minPrice: 300,
  minArea: 25,
  excludeStudent: true,
  districts: ['port'],
};

const token = encodeSearch({
  name: 'Port pas cher',
  criteria,
  view: {
    minPrice: null,
    maxPrice: null,
    minArea: null,
    maxArea: null,
    minRooms: 2,
    minOccupants: null,
    types: [],
    sources: [],
    sort: 'price',
    search: '',
  },
});

describe('recherche partagée, sans session', () => {
  beforeEach(() => {
    calls.listings.length = 0;
    calls.saved = 0;
    window.sessionStorage.clear();
  });

  it('montre la recherche au visiteur, puis filtre la liste par ses critères', async () => {
    window.history.pushState({}, '', `/shared/${token}`);
    render(<App />);

    const browse = await screen.findByRole(
      'button',
      { name: /voir les annonces/i },
      { timeout: 4000 },
    );
    expect(screen.getByRole('button', { name: /créer un compte/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /appliquer cette recherche/i })).toBeNull();

    await userEvent.click(browse);

    await waitFor(() =>
      expect(calls.listings.some((options) => options.criteria?.maxPrice === 650)).toBe(true),
    );
    const filtered = calls.listings.find((options) => options.criteria !== undefined);
    expect(filtered?.criteria).toMatchObject(criteria);
    expect(await screen.findByText(/recherche partagée :/i)).toBeTruthy();
    expect(window.location.pathname).not.toContain('/shared/');
    expect(calls.saved).toBe(0);
  });

  it('garde le lien pour après l’inscription', async () => {
    window.history.pushState({}, '', `/shared/${token}`);
    render(<App />);
    await userEvent.click(
      await screen.findByRole('button', { name: /créer un compte/i }, { timeout: 4000 }),
    );
    expect(window.sessionStorage.getItem('maioun.pendingSharedToken')).toBe(token);
  });

  it('dit qu’un lien tronqué est illisible, au visiteur aussi', async () => {
    window.history.pushState({}, '', '/shared/pas-un-jeton');
    render(<App />);
    expect(await screen.findByText('Lien illisible', {}, { timeout: 4000 })).toBeTruthy();
  });
});
