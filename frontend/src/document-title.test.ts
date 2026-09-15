import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MOCK_LISTINGS } from './api/mock-data.js';
import {
  documentMeta,
  documentTitle,
  listingDescription,
  useDocumentMeta,
} from './document-title.js';

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

describe('métadonnées par page', () => {
  const listing = MOCK_LISTINGS[0]!;

  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('décrit la fiche par ses chiffres, en 160 caractères au plus', () => {
    const description = listingDescription(listing);
    expect(description).toMatch(/à louer/);
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it('donne à chaque écran sa description, et à la fiche sa photo', () => {
    const detail = documentMeta({ view: 'detail', id: listing.id }, listing);
    expect(detail.image).toBe(listing.imageUrls[0] ?? null);
    expect(documentMeta({ view: 'stats' }, null).description).toMatch(/marché locatif/);
    expect(documentMeta({ view: 'stats' }, null).image).toBeNull();
  });

  it('met à jour les balises de partage et l’adresse canonique', () => {
    document.head.innerHTML = '<meta property="og:image" content="https://exemple.invalid/og.png">';
    const { rerender } = renderHook(({ route }) => useDocumentMeta(route, null), {
      initialProps: { route: { view: 'stats' as const } },
    });
    const content = (selector: string): string | null | undefined =>
      document.head.querySelector(selector)?.getAttribute('content');
    expect(document.title).toBe('Statistiques — Maïoun');
    expect(content('meta[property="og:title"]')).toBe('Statistiques — Maïoun');
    expect(content('meta[name="description"]')).toMatch(/marché locatif/);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBeTruthy();

    rerender({ route: { view: 'sources' as const } });
    expect(content('meta[name="twitter:title"]')).toBe('Sources — Maïoun');
    expect(content('meta[property="og:image"]')).toBe('https://exemple.invalid/og.png');
  });
});
