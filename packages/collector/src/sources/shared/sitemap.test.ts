import { describe, expect, it } from 'vitest';
import { sitemapIndexEntries, sitemapIndexUrls, sitemapUrls } from './sitemap.js';

const index = (entries: readonly (readonly [string, string | null])[]): string =>
  `<?xml version="1.0"?><sitemapindex>${entries
    .map(
      ([loc, lastmod]) =>
        `<sitemap><loc>${loc}</loc>${lastmod === null ? '' : `<lastmod>${lastmod}</lastmod>`}</sitemap>`,
    )
    .join('')}</sitemapindex>`;

describe('sitemapUrls', () => {
  it('lit les adresses et leur date, CDATA compris', () => {
    const xml =
      '<urlset><url><loc><![CDATA[https://x.invalid/a]]></loc><lastmod>2026-09-08</lastmod></url>' +
      '<url><loc>https://x.invalid/b</loc></url></urlset>';
    expect(sitemapUrls(xml)).toEqual([
      { loc: 'https://x.invalid/a', lastmod: '2026-09-08' },
      // Aucune date publiée : on n'en invente pas (§17).
      { loc: 'https://x.invalid/b', lastmod: null },
    ]);
  });
});

describe('sitemapIndexEntries', () => {
  it('rend les enfants dans l’ordre du document, avec leur date', () => {
    const xml = index([
      ['https://x.invalid/vente.xml', '2025-01-02'],
      ['https://x.invalid/location.xml', '2026-09-16'],
    ]);
    expect(sitemapIndexEntries(xml)).toEqual([
      { loc: 'https://x.invalid/vente.xml', lastmod: '2025-01-02' },
      { loc: 'https://x.invalid/location.xml', lastmod: '2026-09-16' },
    ]);
  });
});

describe('sitemapIndexUrls', () => {
  it('place en tête l’enfant le plus récemment modifié', () => {
    // Le cas qui motive le tri : les annonces vivent dans le DERNIER fichier de
    // l'index, et les appelants n'en ouvrent que les premiers.
    const xml = index([
      ['https://x.invalid/pages.xml', '2024-03-01'],
      ['https://x.invalid/vente.xml', '2025-01-02'],
      ['https://x.invalid/location.xml', '2026-09-16'],
    ]);
    expect(sitemapIndexUrls(xml)[0]).toBe('https://x.invalid/location.xml');
  });

  it('range les enfants sans date APRÈS ceux qui en ont une', () => {
    const xml = index([
      ['https://x.invalid/sans-date.xml', null],
      ['https://x.invalid/date.xml', '2026-09-16'],
    ]);
    expect(sitemapIndexUrls(xml)).toEqual([
      'https://x.invalid/date.xml',
      'https://x.invalid/sans-date.xml',
    ]);
  });

  it('garde l’ordre du document entre enfants également datés', () => {
    // Tri stable : sans date nulle part, rien ne doit bouger — un index dont
    // l'ordre serait réarrangé à chaque passage ferait lire un fichier
    // différent à chaque fois, et n'en verrait jamais aucun en entier.
    const xml = index([
      ['https://x.invalid/a.xml', null],
      ['https://x.invalid/b.xml', null],
      ['https://x.invalid/c.xml', null],
    ]);
    expect(sitemapIndexUrls(xml)).toEqual([
      'https://x.invalid/a.xml',
      'https://x.invalid/b.xml',
      'https://x.invalid/c.xml',
    ]);
  });

  it('rend une liste vide pour un document qui n’est pas un index', () => {
    expect(sitemapIndexUrls('<urlset><url><loc>https://x.invalid/a</loc></url></urlset>')).toEqual(
      [],
    );
  });
});
