import { describe, expect, it } from 'vitest';
import { matchesSearch, suggestSearch, type Searchable } from './search.js';

// `in` et non `??` : une surcharge explicite à `null` doit être respectée,
// sinon on ne peut pas tester le cas « champ absent » (§17).
const listing = (over: Partial<Record<string, string | null>> = {}): Searchable => {
  const pick = (key: string, fallback: string | null): string | null =>
    key in over ? (over[key] ?? null) : fallback;
  return {
    title: { value: pick('title', 'STUDIO LIBERATION') },
    description: { value: pick('description', 'Proche tramway') },
    city: { value: pick('city', 'Nice') },
    district: { value: pick('district', 'Gambetta') },
    address: { value: pick('address', '12 rue de France') },
    postalCode: { value: pick('postalCode', '06000') },
    contact: { agencyName: pick('agencyName', 'Gestion Cassini') },
  };
};

describe('matchesSearch', () => {
  it('laisse tout passer quand la recherche est vide (§17)', () => {
    expect(matchesSearch(listing(), '')).toBe(true);
    expect(matchesSearch(listing(), '   ')).toBe(true);
  });

  it('ignore la casse et les accents', () => {
    // Les annonces sont souvent en capitales sans accent : « libération »
    // doit tout de même trouver « LIBERATION ».
    expect(matchesSearch(listing({ title: 'STUDIO LIBERATION' }), 'libération')).toBe(true);
    expect(matchesSearch(listing({ district: 'Cimiez' }), 'CIMIEZ')).toBe(true);
  });

  it('cherche dans le quartier, la rue, le code postal et l’agence', () => {
    expect(matchesSearch(listing(), 'gambetta')).toBe(true);
    expect(matchesSearch(listing(), 'rue de france')).toBe(true);
    expect(matchesSearch(listing(), '06000')).toBe(true);
    expect(matchesSearch(listing(), 'cassini')).toBe(true);
  });

  it('exige TOUS les mots saisis, pour restreindre et non élargir', () => {
    expect(matchesSearch(listing(), 'nice gambetta')).toBe(true);
    // « cimiez » n'est nulle part : la combinaison ne doit pas passer.
    expect(matchesSearch(listing(), 'nice cimiez')).toBe(false);
  });

  it('ne casse pas sur les champs absents (§17)', () => {
    const sparse = listing({
      description: null,
      district: null,
      address: null,
      agencyName: null,
    });
    expect(matchesSearch(sparse, 'studio')).toBe(true);
    expect(matchesSearch(sparse, 'gambetta')).toBe(false);
  });
});

/**
 * LA LISTE N'A PAS LA FICHE ENTIÈRE. Le serveur en retire la description et les
 * raisons de score pour ne pas transporter ce qu'elle n'affiche pas. La
 * recherche les déréférençait quand même : la première frappe dans la barre
 * levait une exception et faisait tomber tout l'écran (signalé le 2026-09-08).
 */
describe('matchesSearch sur une fiche allégée', () => {
  it('ne tombe pas quand la description a été retirée', () => {
    const allegee = {
      title: { value: 'Studio meublé Gambetta' },
      city: { value: 'Nice' },
      district: { value: 'Gambetta' },
      address: { value: null },
      postalCode: { value: '06000' },
      contact: { agencyName: 'Agence Test' },
    };
    expect(matchesSearch(allegee, 'gambetta')).toBe(true);
    expect(matchesSearch(allegee, 'introuvable')).toBe(false);
  });

  it('ne tombe pas non plus sans aucun champ', () => {
    expect(matchesSearch({}, 'nice')).toBe(false);
    expect(matchesSearch({}, '')).toBe(true);
  });
});

describe('suggestSearch', () => {
  const catalogue: Searchable[] = [
    listing({ district: 'Gambetta', address: '12 rue Barla', agencyName: 'Cassini' }),
    listing({ district: 'Gambetta', address: '48 rue Barla', agencyName: 'Cassini' }),
    listing({ district: 'Cimiez', address: '3 avenue Borriglione', agencyName: 'Orea' }),
  ];

  it('ne propose rien tant qu’on n’a rien tapé', () => {
    // La barre au repos ne déroule pas de liste sous le curseur.
    expect(suggestSearch(catalogue, '')).toEqual([]);
    expect(suggestSearch(catalogue, '   ')).toEqual([]);
  });

  it('complète un début de mot, où qu’il tombe', () => {
    // Le cas qui rendait la barre inutilisable : il fallait connaître
    // l'orthographe exacte pour obtenir quoi que ce soit.
    expect(suggestSearch(catalogue, 'borigl')).toEqual([]);
    expect(suggestSearch(catalogue, 'borrigl').map((one) => one.value)).toEqual([
      'avenue Borriglione',
    ]);
  });

  it('compte les annonces derrière chaque proposition', () => {
    // Le compte dit d'avance si l'effort en vaut la peine.
    expect(suggestSearch(catalogue, 'gambe')).toEqual([
      { value: 'Gambetta', kind: 'district', count: 2 },
    ]);
  });

  it('regroupe une rue quel que soit le numéro', () => {
    // « 12 rue Barla » et « 48 rue Barla » sont deux adresses et une seule rue.
    expect(suggestSearch(catalogue, 'barla')).toEqual([
      { value: 'rue Barla', kind: 'street', count: 2 },
    ]);
  });

  it('ne se propose pas lui-même', () => {
    // Une suggestion identique à ce qui est déjà tapé ne fait rien avancer.
    expect(suggestSearch(catalogue, 'Cimiez')).toEqual([]);
  });

  it('ignore casse et accents', () => {
    expect(suggestSearch(catalogue, 'CIMIE').map((one) => one.value)).toEqual(['Cimiez']);
  });

  it('range le quartier avant la rue, l’agence et la commune', () => {
    const mixed: Searchable[] = [
      listing({ district: 'Nice Nord', address: 'rue de Nice', agencyName: 'Nice Immo' }),
    ];
    expect(suggestSearch(mixed, 'nic').map((one) => one.kind)).toEqual([
      'district',
      'street',
      'agency',
      'city',
    ]);
    // « nice » exactement : la commune s'exclut elle-même, les trois autres
    // restent — elles APPRENNENT quelque chose, la commune non.
    expect(suggestSearch(mixed, 'nice').map((one) => one.kind)).toEqual([
      'district',
      'street',
      'agency',
    ]);
  });
});
