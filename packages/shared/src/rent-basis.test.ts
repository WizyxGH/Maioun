/** La base du loyer : hors charges, charges comprises, et celle du budget. */

import { describe, expect, it } from 'vitest';
import { rentAllIn, rentExcludingCharges, rentForBudget } from './listing.js';

/** La fiche relevée le 2026-09-17 : 566 € + 158 € = 724 € charges comprises. */
const STUDIO_AMANDA = { price: 566, charges: 158, chargesIncluded: false } as const;
/** La même annonce vue depuis la carte de liste, qui n'affiche que le total. */
const STUDIO_AMANDA_CARTE = { price: 724, charges: null, chargesIncluded: true } as const;

describe('rentAllIn', () => {
  it('additionne la provision à un loyer annoncé hors charges', () => {
    expect(rentAllIn(STUDIO_AMANDA)).toBe(724);
  });

  it('rend le même total que la carte pour la même annonce', () => {
    expect(rentAllIn(STUDIO_AMANDA_CARTE)).toBe(rentAllIn(STUDIO_AMANDA));
  });

  it('n’invente pas de charges absentes', () => {
    expect(rentAllIn({ price: 900, charges: null, chargesIncluded: false })).toBeNull();
    expect(rentAllIn({ price: 900, charges: 50, chargesIncluded: null })).toBeNull();
    expect(rentAllIn({ price: null, charges: 50, chargesIncluded: true })).toBeNull();
  });
});

describe('rentExcludingCharges', () => {
  it('ne rend un loyer hors charges que s’il se déduit sans supposition', () => {
    expect(rentExcludingCharges({ price: 900, charges: null, chargesIncluded: false })).toBe(900);
    expect(rentExcludingCharges({ price: 980, charges: 50, chargesIncluded: true })).toBe(930);
    expect(rentExcludingCharges({ price: 980, charges: null, chargesIncluded: true })).toBeNull();
    expect(rentExcludingCharges({ price: 980, charges: 50, chargesIncluded: null })).toBeNull();
    expect(rentExcludingCharges({ price: null, charges: null, chargesIncluded: false })).toBeNull();
  });

  it('retrouve le loyer hors charges depuis le total de la carte', () => {
    expect(rentExcludingCharges({ price: 724, charges: 158, chargesIncluded: true })).toBe(566);
  });
});

describe('rentForBudget', () => {
  /**
   * LE POINT DE DÉPART DU CORRECTIF : à 700 € de budget, cette annonce passait
   * le filtre par ses 566 € affichés alors qu'elle se loue 724 €.
   */
  it('écarte du budget ce que les charges font dépasser', () => {
    expect(rentForBudget(STUDIO_AMANDA)).toBe(724);
    expect(rentForBudget(STUDIO_AMANDA)! > 700).toBe(true);
  });

  it('ne descend jamais sous le montant publié', () => {
    for (const basis of [
      { price: 900, charges: null, chargesIncluded: false },
      { price: 900, charges: 50, chargesIncluded: null },
      { price: 900, charges: 50, chargesIncluded: true },
    ]) {
      expect(rentForBudget(basis)).toBeGreaterThanOrEqual(basis.price);
    }
  });

  it('n’a rien à comparer sans loyer publié', () => {
    expect(rentForBudget({ price: null, charges: 50, chargesIncluded: false })).toBeNull();
  });
});
