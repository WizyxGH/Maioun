/**
 * « Moi je vois 630.50, pas 631 » — relevé par l'utilisateur, la page de
 * l'agence sous les yeux. Le loyer affiché doit être celui du bail.
 */

import { describe, expect, it } from 'vitest';
import { formatRent } from './money.js';

describe('formatRent', () => {
  it('garde les centimes, avec la virgule française', () => {
    expect(formatRent(630.5)).toBe('630,50 €');
    expect(formatRent(1234.05)).toBe('1234,05 €');
  });

  it('N’AJOUTE PAS de centimes à un loyer rond', () => {
    // « 690,00 € » ferait croire à une précision que l'annonce ne donne pas.
    expect(formatRent(690)).toBe('690 €');
    expect(formatRent(1200)).toBe('1200 €');
  });

  it('ne laisse pas traîner les décimales d’un flottant', () => {
    expect(formatRent(630.5000000000001)).toBe('630,50 €');
    expect(formatRent(0.1 + 0.2)).toBe('0,30 €');
  });

  it('écrit zéro sans décor', () => {
    expect(formatRent(0)).toBe('0 €');
  });
});
