/**
 * VIDER « TRAJET MAX » NE VEUT PAS DIRE ZÉRO MINUTE.
 *
 * Le champ enregistrait `Number('')`, c'est-à-dire 0, que le serveur accepte
 * comme un plafond valide. Un plafond de zéro minute n'accepte aucune annonce
 * localisée : 26 annonces au lieu de 67 dans la liste, 10 alertes au lieu de
 * 40, et pas un mot à l'écran pour dire pourquoi.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Client from '../api/client.js';
import type { FilterConfig } from '../types.js';

const state = vi.hoisted(() => ({
  criteria: {} as FilterConfig,
  saved: [] as FilterConfig[],
}));

vi.mock('../api/client.js', async (original) => {
  const actual = await original<typeof Client>();
  return {
    ...actual,
    fetchFilters: () => Promise.resolve(state.criteria),
    fetchDistricts: () => Promise.resolve([]),
    fetchReferencePoints: () => Promise.resolve([]),
    saveFilters: (filters: FilterConfig) => {
      state.saved.push(filters);
      return Promise.resolve(filters);
    },
  };
});

const { FiltersPanel } = await import('./FiltersPanel.js');

describe('plafond de trajet', () => {
  beforeEach(() => {
    state.criteria = { cities: ['nice'], maxPrice: 700, minArea: 20, maxCommuteMinutes: 60 };
    state.saved.length = 0;
  });

  it('enregistre « pas de plafond » quand le champ est vidé, jamais zéro', async () => {
    render(<FiltersPanel />);
    const field = await screen.findByLabelText('Trajet max domicile→travail');
    expect(field).toHaveValue(60);

    await userEvent.clear(field);

    await waitFor(() => expect(state.saved.length).toBeGreaterThan(0), { timeout: 3000 });
    for (const written of state.saved) {
      expect(written.maxCommuteMinutes).toBeUndefined();
      expect(written.maxCommuteMinutes).not.toBe(0);
    }
  });

  it('dit quel plafond s’applique alors, au lieu de laisser croire qu’il n’y en a plus', async () => {
    state.criteria = { cities: ['nice'], maxPrice: 700, minArea: 20 };
    render(<FiltersPanel />);

    expect(await screen.findByLabelText('Trajet max domicile→travail')).toHaveValue(null);
    expect(screen.getByText(/celui du projet s’applique/)).toBeInTheDocument();
  });

  it('refuse un plafond de zéro minute saisi à la main', async () => {
    render(<FiltersPanel />);
    const field = await screen.findByLabelText('Trajet max domicile→travail');

    await userEvent.clear(field);
    await userEvent.type(field, '0');

    await waitFor(() => expect(state.saved.length).toBeGreaterThan(0), { timeout: 3000 });
    expect(state.saved.at(-1)?.maxCommuteMinutes).toBeUndefined();
  });
});
