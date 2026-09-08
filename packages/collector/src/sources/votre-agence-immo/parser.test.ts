import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDetail, parseListPage } from './parser.js';

const PAGE = readFileSync(
  fileURLToPath(
    new URL('../../../../../tests/fixtures/votre-agence-immo/location.html', import.meta.url),
  ),
  'utf8',
);

describe('parseListPage (Votre Agence Immo)', () => {
  const { listings, warnings } = parseListPage(PAGE);

  /**
   * LE SITEMAP MÊLE VENTES ET LOCATIONS sans rien pour les départager : s'y
   * fier aurait fait entrer des villas à 1,25 M€ dans une base de locations.
   * C'est la classe de l'article qui tranche.
   */
  it('n’garde que les locations', () => {
    expect(listings).toHaveLength(2);
    expect(listings.map((l) => l.sourceRef)).toEqual(['100001', '100002']);
    expect(warnings).toEqual([]);
  });

  it('lit surface, pièces, type et loyer mensuel', () => {
    const l = listings.find((x) => x.sourceRef === '100001');
    expect(l?.areaText).toBe('55.86 m²');
    expect(l?.roomsText).toBe('3 pièces');
    expect(l?.propertyTypeText).toMatch(/appartement/i);
    expect(l?.priceText).toBe('970 € /mois');
    expect(l?.sourceUrl).toContain('/biens/nice-exemple-3-pieces/');
  });

  it('reconnaît un studio et sa photo', () => {
    const l = listings.find((x) => x.sourceRef === '100002');
    expect(l?.propertyTypeText).toMatch(/studio/i);
    expect(l?.imageUrls?.[0]).toContain('media.apimo.pro');
  });

  /** §61 : une page qui ne rend plus rien signale un gabarit changé. */
  it('signale une page devenue muette', () => {
    const vide = parseListPage('<html><body><p>rien</p></body></html>');
    expect(vide.listings).toEqual([]);
    expect(vide.warnings).toHaveLength(1);
  });
});

describe('parseDetail (Votre Agence Immo)', () => {
  it('récupère la description, qui porte l’adresse en clair', () => {
    const html =
      '<html><head><meta name="description" content="Appartement situé au 73 Boulevard Exemple." /></head></html>';
    expect(parseDetail(html)?.description).toContain('73 Boulevard Exemple');
  });

  it('ne conclut rien d’une page sans description (§17)', () => {
    expect(parseDetail('<html><head></head></html>')).toBeNull();
  });
});
