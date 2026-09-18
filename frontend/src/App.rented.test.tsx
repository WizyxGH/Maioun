/**
 * « Louée » range l'annonce — relevé du 2026-09-18.
 *
 * L'utilisateur demandait quel statut poser quand l'agence répond au téléphone
 * que le logement est déjà pris. C'est « Louée », et il fallait alors DEUX
 * gestes : poser le statut, puis archiver. Celui qui n'en faisait qu'un gardait
 * l'annonce sous les yeux indéfiniment.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Client from './api/client.js';

const state = vi.hoisted(() => ({ archived: [] as { id: string; archived: boolean }[] }));

vi.mock('./api/client.js', async (original) => {
  const actual = await original<typeof Client>();
  return {
    ...actual,
    setArchived: (id: string, archived: boolean) => {
      state.archived.push({ id, archived });
      return Promise.resolve();
    },
  };
});

const { App } = await import('./App.js');

async function openFirstListing(): Promise<void> {
  render(<App />);
  const tabs = await screen.findAllByRole('button', { name: 'Recherche' });
  await userEvent.click(tabs[0]!);
  const cards = await screen.findAllByRole('button', { name: /ouvrir la fiche/ });
  await userEvent.click(cards[0]!);
}

describe('statut « Louée »', () => {
  it('archive l’annonce du même geste', async () => {
    state.archived = [];
    await openFirstListing();
    const select = await screen.findByLabelText('Statut');
    await userEvent.selectOptions(select, 'rented');
    await waitFor(() => {
      expect(state.archived.some((a) => a.archived)).toBe(true);
    });
  });

  it('ne range pas une annonce simplement contactée', async () => {
    state.archived = [];
    await openFirstListing();
    const select = await screen.findByLabelText('Statut');
    await userEvent.selectOptions(select, 'contacted');
    await waitFor(() => {
      expect(screen.getByLabelText('Statut')).toHaveValue('contacted');
    });
    expect(state.archived).toEqual([]);
  });
});
