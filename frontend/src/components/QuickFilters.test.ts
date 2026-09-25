// @vitest-environment node
// Aucun navigateur ici : ce test ne touche ni au DOM, ni au stockage, ni à
// `window`. Monter jsdom pour rien coûtait 0,9 s par fichier — 6 s sur les
// trente et un fichiers concernés, à chaque exécution.

/**
 * CE QUE LES FILTRES RAPIDES ÉCARTENT — et, à l'ouverture, RIEN.
 *
 * Ils s'ouvraient sur 250–700 € et ≥ 20 m², les critères d'une personne écrits
 * en dur : tout le monde en héritait, et un visiteur voyait 169 annonces sur
 * 2 285 sans qu'aucune puce ne le dise. Deux prédicats cohabitaient pour
 * distinguer « posé » de « s'écarte de l'ouverture » ; sans valeurs
 * d'ouverture, c'est la même question.
 */

import { describe, expect, it } from 'vitest';
import {
  EMPTY_QUICK_FILTERS,
  hasAppliedQuickFilters,
  priceLabel,
  type QuickFilterValues,
} from './QuickFilters.js';

const AUCUN: QuickFilterValues = {
  minPrice: null,
  maxPrice: null,
  minArea: null,
  maxArea: null,
  minRooms: null,
  minOccupants: null,
  types: new Set(),
};

describe('filtres rapides : ce qui est posé', () => {
  // L'OUVERTURE N'ÉCARTE RIEN : le budget d'un compte sert à scorer et à
  // alerter, pas à retrancher en silence la liste de quelqu'un d'autre.
  it('à l’ouverture, aucun filtre n’est posé', () => {
    expect(hasAppliedQuickFilters(EMPTY_QUICK_FILTERS)).toBe(false);
    expect(EMPTY_QUICK_FILTERS.maxPrice).toBeNull();
    expect(EMPTY_QUICK_FILTERS.minArea).toBeNull();
  });

  it('un budget posé à la main se voit', () => {
    expect(hasAppliedQuickFilters({ ...AUCUN, maxPrice: 700 })).toBe(true);
  });

  it('le plancher anti-parking compte comme un filtre posé', () => {
    // 250 € n'avait aucune puce : la barre pouvait s'afficher sans contenir
    // quoi que ce soit à retirer.
    expect(hasAppliedQuickFilters({ ...AUCUN, minPrice: 250 })).toBe(true);
  });

  it('un type de bien retenu suffit', () => {
    expect(hasAppliedQuickFilters({ ...AUCUN, types: new Set(['apartment'] as const) })).toBe(true);
  });

  it('nomme le budget selon les bornes réellement posées', () => {
    expect(priceLabel(250, 700)).toBe('250 – 700 €');
    expect(priceLabel(null, 700)).toBe('≤ 700 €');
    expect(priceLabel(250, null)).toBe('≥ 250 €');
  });
});
