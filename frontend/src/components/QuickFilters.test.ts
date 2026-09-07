/**
 * Les DEUX questions que posent les filtres rapides (§39).
 *
 * Un seul prédicat y répondait, et les deux réponses diffèrent : l'état
 * d'ouverture n'est pas « aucun filtre », il porte déjà 250–700 € et ≥ 20 m².
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUICK_FILTERS,
  hasActiveQuickFilters,
  hasAppliedQuickFilters,
  priceLabel,
  type QuickFilterValues,
} from './QuickFilters.js';

const AUCUN: QuickFilterValues = {
  minPrice: null,
  maxPrice: null,
  minArea: null,
  minRooms: null,
  minOccupants: null,
  types: new Set(),
};

describe('filtres rapides : écart et application', () => {
  it('à l’ouverture, des filtres sont POSÉS sans que rien ne s’écarte', () => {
    // C'est tout le sujet : la liste est filtrée sur le budget et la surface,
    // donc les puces doivent se montrer — mais « Réinitialiser » n'a rien à
    // faire, puisqu'on est exactement à l'état d'ouverture.
    expect(hasAppliedQuickFilters(DEFAULT_QUICK_FILTERS)).toBe(true);
    expect(hasActiveQuickFilters(DEFAULT_QUICK_FILTERS)).toBe(false);
  });

  it('après « Effacer tout », plus rien n’est posé — mais tout s’écarte', () => {
    // La barre de puces disparaît (rien à montrer), et « Réinitialiser »
    // apparaît (il y a de quoi rétablir). C'est l'inverse exact de
    // l'ouverture, et c'est ce que l'ancien prédicat unique ne pouvait pas
    // exprimer : la barre restait affichée, vide, avec son seul lien
    // « Effacer tout » sur lequel recliquer ne faisait rien.
    expect(hasAppliedQuickFilters(AUCUN)).toBe(false);
    expect(hasActiveQuickFilters(AUCUN)).toBe(true);
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
