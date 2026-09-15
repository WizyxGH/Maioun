import { describe, expect, it } from 'vitest';
import { documentTitle } from './document-title.js';

describe('documentTitle', () => {
  it('nomme la fiche ouverte, et l’agence', () => {
    expect(documentTitle('detail', { listing: 'Studio · Libération · 650 €' })).toBe(
      'Studio · Libération · 650 € — Maïoun',
    );
    expect(documentTitle('agency', { agency: 'Carletta' })).toBe('Carletta — Maïoun');
  });

  it('distingue favoris et recherche', () => {
    expect(documentTitle('list', { favoritesOnly: true })).toBe('Favoris — Maïoun');
    expect(documentTitle('list')).toBe('Recherche — Maïoun');
  });

  it('retombe sur le nom de l’écran tant que la fiche n’est pas chargée', () => {
    expect(documentTitle('detail', { listing: null })).toBe('Annonce — Maïoun');
    expect(documentTitle('home')).toBe('Maïoun — locations à Nice');
  });
});
