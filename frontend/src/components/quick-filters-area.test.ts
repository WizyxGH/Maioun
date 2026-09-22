/**
 * LA SURFACE N'AVAIT QU'UN PLANCHER.
 *
 * Le budget se règle par une fourchette depuis toujours ; la surface, non — un
 * seul champ « au moins ». Rien n'écartait donc les grands logements qu'on ne
 * cherche pas, et qu'on paierait.
 */

import { describe, expect, it } from 'vitest';
import {
  appliedQuickFilterCount,
  areaLabel,
  matchesQuickFilters,
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

/** Une annonce réduite aux champs que les filtres rapides inspectent. */
const annonce = (area: number | null) => ({
  price: { value: 700 },
  area: { value: area },
  rooms: { value: 2 },
  propertyType: { value: 'apartment' as const },
});

describe('le plafond de surface', () => {
  it('écarte une annonce plus grande que le maximum', () => {
    const filtres = { ...AUCUN, maxArea: 60 };
    expect(matchesQuickFilters(annonce(75), filtres)).toBe(false);
    expect(matchesQuickFilters(annonce(60), filtres)).toBe(true);
    expect(matchesQuickFilters(annonce(45), filtres)).toBe(true);
  });

  /**
   * LE PLANCHER ET LE PLAFOND NE TRAITENT PAS PAREIL UNE SURFACE INCONNUE, et
   * c'est voulu : le plancher sert à reconnaître un box, le plafond à refuser
   * un grand logement — or une annonce muette n'est pas un grand logement.
   */
  it('garde une annonce dont la surface n’est pas publiée', () => {
    expect(matchesQuickFilters(annonce(null), { ...AUCUN, maxArea: 60 })).toBe(true);
    expect(matchesQuickFilters(annonce(null), { ...AUCUN, minArea: 20 })).toBe(false);
  });

  it('se combine au plancher pour faire une fourchette', () => {
    const filtres = { ...AUCUN, minArea: 30, maxArea: 60 };
    expect(matchesQuickFilters(annonce(20), filtres)).toBe(false);
    expect(matchesQuickFilters(annonce(45), filtres)).toBe(true);
    expect(matchesQuickFilters(annonce(75), filtres)).toBe(false);
  });

  /** Une fourchette n'est qu'une puce, comme le budget — sinon elle compte double. */
  it('ne compte que pour un filtre, bornes des deux côtés comprises', () => {
    expect(appliedQuickFilterCount({ ...AUCUN, minArea: 30, maxArea: 60 })).toBe(1);
    expect(appliedQuickFilterCount({ ...AUCUN, maxArea: 60 })).toBe(1);
  });

  it('s’intitule selon les bornes réellement posées', () => {
    expect(areaLabel(30, 60)).toBe('30 – 60 m²');
    expect(areaLabel(null, 60)).toBe('≤ 60 m²');
    expect(areaLabel(30, null)).toBe('≥ 30 m²');
  });
});
