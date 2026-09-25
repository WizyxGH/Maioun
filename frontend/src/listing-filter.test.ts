import { describe, expect, it } from 'vitest';
import { EMPTY_QUICK_FILTERS } from './components/QuickFilters.js';
import { filterListings } from './listing-filter.js';
import { MOCK_LISTINGS } from './api/mock-data.js';
import { ALL_SOURCES } from './source-selection.js';

describe('filterListings', () => {
  const base = {
    sources: ALL_SOURCES,
    quick: EMPTY_QUICK_FILTERS,
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

  // « UNE PARTIE DES FILTRES N'EST PAS PRISE EN COMPTE » — relevé du
  // 2026-09-17 : ce que la barre annonce en puces doit filtrer. La règle tient
  // toujours, mais l'ouverture ne pose plus rien : c'est un budget SAISI qu'on
  // vérifie, et lui seul écarte.
  it('un budget et une surface posés filtrent ce que leurs puces annoncent', () => {
    const petit = {
      ...MOCK_LISTINGS[0]!,
      id: 'petit',
      area: { ...MOCK_LISTINGS[0]!.area, value: 18 },
    };
    const cher = {
      ...MOCK_LISTINGS[0]!,
      id: 'cher',
      price: { ...MOCK_LISTINGS[0]!.price, value: 1200 },
    };
    const pose = { ...base, quick: { ...base.quick, minPrice: 250, maxPrice: 700, minArea: 20 } };
    expect(filterListings([MOCK_LISTINGS[0]!, petit, cher], pose).map((one) => one.id)).toEqual([
      MOCK_LISTINGS[0]!.id,
    ]);
  });

  // ET L'OUVERTURE N'ÉCARTE RIEN : c'était tout le problème, trois quarts du
  // catalogue retranchés en silence pour le budget de quelqu'un d'autre.
  it('sans filtre posé, la liste garde tout', () => {
    const petit = {
      ...MOCK_LISTINGS[0]!,
      id: 'petit',
      area: { ...MOCK_LISTINGS[0]!.area, value: 18 },
    };
    expect(filterListings([MOCK_LISTINGS[0]!, petit], base)).toHaveLength(2);
  });

  // L'EFFET NE DOIT PAS ATTENDRE UN AUTRE RÉGLAGE. Poser « 1 personne » — que
  // presque aucune annonce ne renseigne — allumait d'un coup le budget et la
  // surface, et retirait donc des annonces sans rapport avec ce qu'on venait
  // de demander.
  it('un filtre sans effet propre ne change rien à la liste', () => {
    const petit = {
      ...MOCK_LISTINGS[0]!,
      id: 'petit',
      area: { ...MOCK_LISTINGS[0]!.area, value: 18 },
    };
    const listings = [MOCK_LISTINGS[0]!, petit];
    const avec = { ...base, quick: { ...EMPTY_QUICK_FILTERS, minOccupants: 1 } };
    expect(filterListings(listings, avec)).toEqual(filterListings(listings, base));
  });

  // « Effacer tout » pose des valeurs nulles : plus aucune puce, donc plus
  // aucun écart — la liste entière revient.
  it('« effacer tout » ne retient plus rien', () => {
    const petit = {
      ...MOCK_LISTINGS[0]!,
      id: 'petit',
      area: { ...MOCK_LISTINGS[0]!.area, value: 18 },
    };
    const vide = { ...base, quick: EMPTY_QUICK_FILTERS };
    expect(filterListings([MOCK_LISTINGS[0]!, petit], vide)).toHaveLength(2);
  });

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
  it('« pas encore vues » ne garde que les annonces jamais ouvertes', () => {
    // Le statut ne décide pas : une annonce ouverte puis laissée sans décision
    // garde le statut « nouvelle », et c'est elle qu'on ne veut plus revoir.
    const ouverte = { ...MOCK_LISTINGS[0]!, id: 'ouverte', viewed: true };
    const ouverteEtContactee = {
      ...MOCK_LISTINGS[0]!,
      id: 'ouverte-contactee',
      viewed: true,
      tracking: 'contacted' as const,
    };
    const jamaisOuverte = { ...MOCK_LISTINGS[0]!, id: 'jamais-ouverte', viewed: false };
    const listings = [jamaisOuverte, ouverte, ouverteEtContactee];

    expect(filterListings(listings, base)).toHaveLength(3);
    expect(filterListings(listings, { ...base, newOnly: true }).map((one) => one.id)).toEqual([
      'jamais-ouverte',
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
