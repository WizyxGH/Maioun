import { describe, expect, it } from 'vitest';
import { DEFAULT_QUICK_FILTERS } from './components/QuickFilters.js';
import { filterListings } from './listing-filter.js';
import { MOCK_LISTINGS } from './api/mock-data.js';
import { ALL_SOURCES } from './source-selection.js';

describe('filterListings', () => {
  const base = {
    sources: ALL_SOURCES,
    quick: DEFAULT_QUICK_FILTERS,
    search: '',
    hideUncertain: false,
    newOnly: false,
  };

  /** Une annonce venue d'une source apparue APRÈS le réglage du filtre. */
  const nouvelle = {
    ...MOCK_LISTINGS[0]!,
    id: 'nouvelle',
    occurrences: [{ ...MOCK_LISTINGS[0]!.occurrences[0]!, sourceId: 'agence-toute-neuve' }],
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

  // LE DÉFAUT QUI A MOTIVÉ LES MODES : une source ajoutée après coup se
  // retrouvait exclue sans que personne l'ait demandé, le filtre ne gardant
  // qu'une liste de sources cochées un jour donné.
  it('en mode « sauf », une source apparue depuis reste affichée', () => {
    const filter = { ...base, sources: { mode: 'except' as const, ids: new Set(['locservice']) } };
    expect(filterListings([nouvelle], filter)).toHaveLength(1);
  });

  it('en mode « seulement », une source apparue depuis reste écartée', () => {
    const filter = { ...base, sources: { mode: 'only' as const, ids: new Set(['locservice']) } };
    expect(filterListings([nouvelle], filter)).toEqual([]);
  });

  // « Nouvelle » = le SUIVI, pas la date de découverte : tout statut posé —
  // y compris « À contacter », que l'utilisateur a choisi lui-même — sort.
  it('« nouvelles uniquement » ne garde que les annonces sans statut de suivi', () => {
    const contactee = { ...MOCK_LISTINGS[0]!, id: 'contactee', tracking: 'contacted' as const };
    const aContacter = { ...MOCK_LISTINGS[0]!, id: 'a-contacter', tracking: 'toContact' as const };
    const listings = [MOCK_LISTINGS[0]!, contactee, aContacter];

    expect(filterListings(listings, base)).toHaveLength(3);
    expect(filterListings(listings, { ...base, newOnly: true }).map((one) => one.id)).toEqual([
      MOCK_LISTINGS[0]!.id,
    ]);
  });

  // La fraîcheur ne doit PAS s'en mêler : une annonce découverte il y a un mois
  // et jamais traitée reste « nouvelle ».
  it('ne regarde pas la date de découverte', () => {
    const ancienne = {
      ...MOCK_LISTINGS[0]!,
      id: 'ancienne',
      firstSeenAt: '2020-01-01T00:00:00.000Z',
    };
    expect(filterListings([ancienne], { ...base, newOnly: true })).toHaveLength(1);
  });
});
