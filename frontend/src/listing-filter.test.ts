import { describe, expect, it } from 'vitest';
import { DEFAULT_QUICK_FILTERS } from './components/QuickFilters.js';
import { filterListings } from './listing-filter.js';
import { MOCK_LISTINGS } from './api/mock-data.js';

describe('filterListings', () => {
  const base = {
    sources: new Set<string>(),
    quick: DEFAULT_QUICK_FILTERS,
    search: '',
    hideUncertain: false,
  };

  it('garde les annonces « à vérifier » tant qu’on ne les masque pas', () => {
    const uncertain = { ...MOCK_LISTINGS[0]!, id: 'x', lifecycle: 'possiblyInactive' as const };
    const listings = [MOCK_LISTINGS[0]!, uncertain];
    expect(filterListings(listings, base)).toHaveLength(2);
    expect(filterListings(listings, { ...base, hideUncertain: true })).toHaveLength(1);
  });

  it('applique le mot cherché', () => {
    expect(filterListings(MOCK_LISTINGS, { ...base, search: 'zzzzzzzz' })).toEqual([]);
  });
});
