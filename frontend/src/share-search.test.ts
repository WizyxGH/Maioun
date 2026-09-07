import { describe, expect, it } from 'vitest';
import { decodeSearch, encodeSearch } from './share-search.js';
import type { SavedSearch } from './saved-searches.js';

const RECHERCHE: Pick<SavedSearch, 'name' | 'criteria' | 'view'> = {
  name: 'Studio Libération ≤ 700 €',
  criteria: {
    cities: ['nice'],
    maxPrice: 700,
    minArea: 20,
    excludeFlatShare: true,
    districts: ['liberation', 'gambetta'],
    availableBy: '2026-10-01',
  },
  view: {
    minPrice: null,
    maxPrice: 700,
    minArea: 20,
    minRooms: 1,
    minOccupants: null,
    types: ['apartment'],
    sources: ['orpi', 'citya'],
    sort: 'area',
    search: 'balcon',
  },
};

describe('encodeSearch / decodeSearch', () => {
  it('fait l’aller-retour sans rien perdre', () => {
    const decoded = decodeSearch(encodeSearch(RECHERCHE));
    expect(decoded).toEqual(RECHERCHE);
  });

  it('survit aux accents, que `btoa` refuse tel quel', () => {
    // `btoa` lève au-delà du caractère 255, et un nom français en porte au
    // premier accent : sans passer par UTF-8, le partage tombait sur « é ».
    const decoded = decodeSearch(encodeSearch(RECHERCHE));
    expect(decoded?.name).toBe('Studio Libération ≤ 700 €');
  });

  it('produit un jeton qui traverse une URL sans être réécrit', () => {
    // Ni `+`, ni `/`, ni `=` : ces trois-là ne survivent pas au passage dans
    // une adresse, et un lien coupé n'est plus un lien.
    expect(encodeSearch(RECHERCHE)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rend null sur un jeton illisible, sans jamais lever (§69)', () => {
    // Un lien tronqué par une messagerie est une chose banale : l'écran doit
    // pouvoir le dire, pas tomber.
    expect(decodeSearch('')).toBeNull();
    expect(decodeSearch('pas-du-base64!!')).toBeNull();
    expect(decodeSearch(encodeSearch(RECHERCHE).slice(0, 20))).toBeNull();
  });

  it('REFUSE un JSON valide qui n’est pas une recherche', () => {
    // Sans ce contrôle, un objet quelconque irait s'écrire dans les critères du
    // destinataire, où il resterait à demeure.
    const bidon = btoa(JSON.stringify({ name: 'x', criteria: { foo: 1 }, view: {} }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodeSearch(bidon)).toBeNull();
  });

  it('refuse un jeton démesuré plutôt que de l’analyser', () => {
    expect(decodeSearch('A'.repeat(5000))).toBeNull();
  });

  it('donne un nom de repli quand le lien n’en porte pas', () => {
    const sansNom = encodeSearch({ ...RECHERCHE, name: '' });
    expect(decodeSearch(sansNom)?.name).toBe('Recherche partagée');
  });
});
