import { describe, expect, it } from 'vitest';
import { isKnownTerritory, knownRatio, KNOWN_RATIO_STOP } from './known-territory.js';

describe('knownRatio', () => {
  it('rend la part de déjà-vu de la page', () => {
    expect(knownRatio(10, 5)).toBe(0.5);
    expect(knownRatio(5, 5)).toBe(1);
    expect(knownRatio(10, 0)).toBe(0);
  });

  // Le piège que les deux copies portaient : `0 / 0` vaut `NaN`, et toute
  // comparaison avec `NaN` est fausse — la pagination ne se serait jamais arrêtée.
  it('rend 1 sur une page sans annonce, jamais `NaN`', () => {
    expect(knownRatio(0, 0)).toBe(1);
    expect(Number.isNaN(knownRatio(0, 0))).toBe(false);
  });
});

describe('isKnownTerritory', () => {
  it('arrête au seuil, et pas avant', () => {
    expect(isKnownTerritory(10, 8)).toBe(true);
    expect(isKnownTerritory(10, 7)).toBe(false);
  });

  it('arrête sur une page entièrement connue comme sur une page vide', () => {
    expect(isKnownTerritory(12, 12)).toBe(true);
    expect(isKnownTerritory(0, 0)).toBe(true);
  });

  it('garde le seuil relevé sur les listes triées par nouveauté', () => {
    expect(KNOWN_RATIO_STOP).toBe(0.8);
  });
});
