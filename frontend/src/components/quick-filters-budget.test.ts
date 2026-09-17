/**
 * LE CURSEUR DE BUDGET SE JUGE CHARGES COMPRISES — relevé du 2026-09-17.
 *
 * Le serveur avait été corrigé, pas le navigateur : le curseur comparait le
 * montant PUBLIÉ. Une annonce à « 566 € + 158 € de provision » restait donc
 * visible sous un budget de 700 €, alors qu'elle coûte 724 €.
 */

import { describe, expect, it } from 'vitest';
import { matchesQuickFilters, type QuickFilterValues } from './QuickFilters.js';

const NO_FILTER: QuickFilterValues = {
  minPrice: null,
  maxPrice: null,
  minArea: null,
  minRooms: null,
  minOccupants: null,
  types: new Set(),
};

const listing = (price: number, charges: number | null, included: boolean | null) => ({
  price: { value: price },
  charges: { value: charges },
  chargesIncluded: included,
  area: { value: 27 },
  rooms: { value: 1 },
  propertyType: { value: 'studio' as const },
});

describe('budget des filtres rapides', () => {
  it('écarte une annonce dont le total dépasse, même si le montant publié tient', () => {
    // Studio Amanda : 566 € hors charges, 158 € de provision, 724 € au total.
    const amanda = listing(566, 158, false);
    expect(matchesQuickFilters(amanda, { ...NO_FILTER, maxPrice: 700 })).toBe(false);
    expect(matchesQuickFilters(amanda, { ...NO_FILTER, maxPrice: 730 })).toBe(true);
  });

  it('ne compte pas deux fois des charges déjà comprises', () => {
    const toutCompris = listing(690, 80, true);
    expect(matchesQuickFilters(toutCompris, { ...NO_FILTER, maxPrice: 700 })).toBe(true);
  });

  it('s’en tient au montant publié quand la source ne dit rien des charges', () => {
    // Rien à ajouter sans inventer : on ne gonfle pas un loyer par précaution.
    const muette = listing(690, null, null);
    expect(matchesQuickFilters(muette, { ...NO_FILTER, maxPrice: 700 })).toBe(true);
  });

  it('garde le plancher sur le montant publié', () => {
    // Le plancher reconnaît un box à 100 € ; l'y appliquer charges comprises
    // ferait entrer des biens que ce filtre existe pour écarter.
    const box = listing(100, 150, false);
    expect(matchesQuickFilters(box, { ...NO_FILTER, minPrice: 250 })).toBe(false);
  });
});
