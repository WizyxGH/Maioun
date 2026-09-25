// @vitest-environment node
// Aucun navigateur ici : ce test ne touche ni au DOM, ni au stockage, ni à
// `window`. Monter jsdom pour rien coûtait 0,9 s par fichier — 6 s sur les
// trente et un fichiers concernés, à chaque exécution.

import { describe, expect, it, vi } from 'vitest';
import { FIRST_PAGE, loadInStages } from './progressive-load.js';
import type { ListingView, ListingsResponse } from './types.js';

const page = (count: number, total: number): ListingsResponse => ({
  listings: Array.from({ length: count }, (_, index) => ({ id: `a:${index}` }) as ListingView),
  total,
  limit: count,
  offset: 0,
});

describe('loadInStages', () => {
  it('affiche d’abord la première page, puis la liste entière', async () => {
    const fetchPage = vi.fn((limit: number | undefined) =>
      Promise.resolve(limit === undefined ? page(120, 120) : page(FIRST_PAGE, 120)),
    );
    const seen: number[] = [];
    await loadInStages(fetchPage, (response) => seen.push(response.listings.length) > 0, true);
    expect(fetchPage.mock.calls.map(([limit]) => limit)).toEqual([FIRST_PAGE, undefined]);
    expect(seen).toEqual([FIRST_PAGE, 120]);
  });

  it('ne redemande rien quand tout tenait dans la première page', async () => {
    const fetchPage = vi.fn(() => Promise.resolve(page(12, 12)));
    const onStage = vi.fn(() => true);
    await loadInStages(fetchPage, onStage, true);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(onStage).toHaveBeenCalledTimes(1);
  });

  it('s’arrête si la première réponse est périmée', async () => {
    const fetchPage = vi.fn(() => Promise.resolve(page(FIRST_PAGE, 300)));
    await loadInStages(fetchPage, () => false, true);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('recharge d’un coup ce qui est déjà affiché, sans repasser par cinquante lignes', async () => {
    const fetchPage = vi.fn(() => Promise.resolve(page(300, 300)));
    const seen: number[] = [];
    await loadInStages(fetchPage, (response) => seen.push(response.listings.length) > 0, false);
    expect(fetchPage.mock.calls).toEqual([[undefined]]);
    expect(seen).toEqual([300]);
  });

  it('laisse remonter l’échec de la seconde requête', async () => {
    const fetchPage = vi
      .fn<(limit: number | undefined) => Promise<ListingsResponse>>()
      .mockResolvedValueOnce(page(FIRST_PAGE, 300))
      .mockRejectedValueOnce(new Error('réseau'));
    const onStage = vi.fn(() => true);
    await expect(loadInStages(fetchPage, onStage, true)).rejects.toThrow('réseau');
    expect(onStage).toHaveBeenCalledTimes(1);
  });
});
