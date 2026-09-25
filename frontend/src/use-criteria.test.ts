/**
 * « ANNULER » NE DÉFAIT QUE LE GESTE QU'IL ANNONCE.
 *
 * La rangée de retour arrière d'« Effacer tout » remet les critères d'AVANT
 * l'effacement. Elle ne doit donc pas survivre à un réglage postérieur : elle
 * écraserait silencieusement ce réglage-là.
 *
 * Deux chemins la retiraient déjà — le retrait d'une puce et le panneau des
 * filtres —, chacun en pensant à appeler l'oubli de son côté. UN TROISIÈME NE
 * L'APPELAIT PAS : appliquer une recherche enregistrée. « Effacer tout », puis
 * rappeler une recherche, puis « Annuler » : les critères de la recherche
 * partaient sans un mot, remplacés par ceux d'avant l'effacement.
 *
 * Le correctif n'est pas un appel de plus mais une porte de moins : le seul
 * moyen d'écrire les critères passe désormais par `adoptCriteria`, qui oublie
 * le retour arrière. Il n'y a plus de chemin où l'oublier soit à décider.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Client from './api/client.js';
import type { FilterConfig } from './types.js';

const base: FilterConfig = {
  cities: ['nice'],
  maxPrice: 700,
  minArea: 20,
  excludeFlatShare: true,
  excludeStudent: true,
  landlordFilter: 'all',
  districts: ['liberation', 'carre-dor'],
};

const state = { criteria: base, saved: [] as FilterConfig[], failNextSave: false };

vi.mock('./api/client.js', async (original) => ({
  ...(await original<typeof Client>()),
  fetchFilters: () => Promise.resolve(state.criteria),
  saveFilters: (filters: FilterConfig) => {
    if (state.failNextSave) {
      state.failNextSave = false;
      return Promise.reject(new Error('réseau'));
    }
    state.saved.push(filters);
    state.criteria = filters;
    return Promise.resolve(filters);
  },
}));

const { useCriteria } = await import('./use-criteria.js');

function monter(): ReturnType<typeof renderHook<ReturnType<typeof useCriteria>, unknown>> {
  return renderHook(() =>
    useCriteria({ currentUser: 'moi', reload: () => undefined, onError: () => undefined }),
  );
}

describe('useCriteria', () => {
  beforeEach(() => {
    localStorage.clear();
    state.criteria = { ...base };
    state.saved.length = 0;
    state.failNextSave = false;
  });

  it('ne demande rien à un visiteur sans compte', async () => {
    const { result } = renderHook(() =>
      useCriteria({ currentUser: null, reload: () => undefined, onError: () => undefined }),
    );
    // Un visiteur n'a pas de critères : on ne devine pas des filtres.
    await Promise.resolve();
    expect(result.current.criteria).toBeNull();
  });

  it('garde de quoi défaire un « Effacer tout »', async () => {
    const { result } = monter();
    await waitFor(() => expect(result.current.criteria).not.toBeNull());

    await act(() => result.current.clearEveryCriterion());
    expect(result.current.clearedUndo?.previous).toEqual(base);
    expect(result.current.criteria?.districts ?? []).toHaveLength(0);

    await act(() => result.current.undoClear());
    expect(result.current.criteria).toEqual(base);
    expect(result.current.clearedUndo).toBeNull();
  });

  // LE CŒUR DU SUJET : n'importe quel réglage postérieur retire la rangée.
  it('retire le retour arrière dès que les critères sont réglés ensuite', async () => {
    const { result } = monter();
    await waitFor(() => expect(result.current.criteria).not.toBeNull());
    await act(() => result.current.clearEveryCriterion());
    expect(result.current.clearedUndo).not.toBeNull();

    // Ce que fait une recherche enregistrée qu'on rappelle : elle écrit ses
    // critères, puis l'écran s'aligne.
    const recherche: FilterConfig = { ...base, maxPrice: 900, districts: ['riquier'] };
    act(() => result.current.adoptCriteria(recherche));

    expect(result.current.criteria).toEqual(recherche);
    expect(result.current.clearedUndo).toBeNull();
  });

  it('remet la puce en place quand l’écriture échoue', async () => {
    const { result } = monter();
    await waitFor(() => expect(result.current.criteria).not.toBeNull());

    state.failNextSave = true;
    await act(() => result.current.relaxCriterion({ excludeFlatShare: false }));

    // Une puce retirée alors que le filtre tient encore ferait croire à un
    // catalogue qu'on ne voit pas.
    expect(result.current.criteria?.excludeFlatShare).toBe(true);
  });
});
