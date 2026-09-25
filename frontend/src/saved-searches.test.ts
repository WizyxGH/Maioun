import { describe, expect, it } from 'vitest';
import {
  describeSearch,
  formatCriteriaCity,
  formatDistricts,
  searchParts,
  suggestName,
  type SavedSearch,
  type SearchPart,
} from './saved-searches.js';
import { EMPTY_QUICK_FILTERS } from './components/QuickFilters.js';
import type { FilterConfig } from './types.js';

const VIEW: SavedSearch['view'] = {
  minPrice: null,
  maxPrice: null,
  minArea: null,
  maxArea: null,
  minRooms: null,
  minOccupants: null,
  types: [],
  sources: [],
  sort: 'priority',
  search: '',
};

function search(criteria: FilterConfig): SavedSearch {
  return { id: 's', name: 'S', createdAt: '2026-09-01T00:00:00.000Z', criteria, view: VIEW };
}

describe('formatCriteriaCity', () => {
  it('écrit les communes comme une carte', () => {
    expect(formatCriteriaCity('nice')).toBe('Nice');
    expect(formatCriteriaCity('saint-laurent-du-var')).toBe('Saint-Laurent-du-Var');
    expect(formatCriteriaCity('cagnes sur mer')).toBe('Cagnes-sur-Mer');
  });

  it('met une commune inconnue en casse de titre, particules comprises', () => {
    expect(formatCriteriaCity('saint-paul-de-vence')).toBe('Saint-Paul-de-Vence');
    expect(formatCriteriaCity('la gaude')).toBe('La Gaude');
  });

  it('ne coupe pas un nom qui commence par une commune connue', () => {
    expect(formatCriteriaCity('nice nord')).toBe('Nice Nord');
  });
});

describe('formatDistricts', () => {
  it('cite les premiers quartiers, puis combien d’autres', () => {
    expect(formatDistricts([])).toBe('');
    expect(formatDistricts(['cimiez', 'liberation'])).toBe('Cimiez, Libération');
    expect(formatDistricts(['cimiez', 'liberation', 'vieux-nice', 'gambetta', 'riquier'])).toBe(
      'Cimiez, Libération +3',
    );
  });
});

describe('searchParts', () => {
  it('ville en casse de titre, quartiers à la suite', () => {
    const parts = searchParts(
      search({ cities: ['nice'], maxPrice: 700, minArea: 0, districts: ['cimiez', 'liberation'] }),
    );
    expect(parts[0]).toEqual({ kind: 'place', label: 'Nice · Cimiez, Libération' });
  });

  it('sans quartier, la ville seule', () => {
    expect(describeSearch(search({ cities: ['nice'], maxPrice: 700, minArea: 0 }))).toBe(
      'Nice · ≤ 700 €',
    );
  });
});

describe('suggestName', () => {
  it('reprend la ville bien écrite', () => {
    expect(
      suggestName({ cities: ['cagnes-sur-mer'], maxPrice: 700, minArea: 0 }, EMPTY_QUICK_FILTERS),
    ).toMatch(/^Cagnes-sur-Mer/);
  });
});

/**
 * LE RÉSUMÉ D'UNE RECHERCHE DIT LE SENS DU FILTRE. « 19 sources » cachait
 * qu'une recherche rappelée écartait tout ce qu'elle ne nommait pas, agences
 * ajoutées depuis comprises.
 */
describe('les sources d’une recherche', () => {
  const avecSources = (view: Partial<SavedSearch['view']>): SearchPart | undefined =>
    searchParts({
      ...search({ cities: [], maxPrice: 700, minArea: 0 }),
      view: { ...VIEW, ...view },
    }).find((part) => part.kind === 'sources');

  it('nomme les sources retenues, puis combien d’autres', () => {
    expect(avecSources({ sources: ['orpi', 'fnaim'], sourceMode: 'only' })?.label).toMatch(
      /^Seulement .+, .+$/,
    );
    const many = avecSources({
      sources: ['orpi', 'fnaim', 'foncia', 'locservice'],
      sourceMode: 'only',
    })?.label;
    expect(many).toMatch(/^Seulement .+, .+ \+2$/);
    expect(many).not.toContain('orpi');
  });

  it('dit « sauf » quand la recherche exclut', () => {
    expect(avecSources({ sources: ['locservice'], sourceMode: 'except' })?.label).toBe(
      'Sauf LocService',
    );
  });

  it('une recherche d’avant les modes garde son sens', () => {
    expect(avecSources({ sources: ['orpi'] })?.label).toBe('Seulement Orpi');
    expect(avecSources({ sources: [] })).toBeUndefined();
  });
});
