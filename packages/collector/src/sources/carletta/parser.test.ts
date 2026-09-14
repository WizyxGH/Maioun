import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseSitemap } from './parser.js';

// Sitemap et fiche réels du 2026-09-14, allégés.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/carletta');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

describe('parseSitemap (Carletta)', () => {
  const listings = parseSitemap(read('sitemap-fr.xml'));

  it('ne garde que les locations, en https', () => {
    expect(listings.map((l) => l.sourceRef).sort()).toEqual(['127', '351']);
    expect(listings.every((l) => l.sourceUrl.startsWith('https://www.carletta.fr/location/'))).toBe(
      true,
    );
  });

  it('lit type, commune et code postal dans l’adresse', () => {
    const garage = listings.find((l) => l.sourceRef === '351');
    expect(garage?.propertyTypeText).toBe('garage');
    expect(garage?.cityText).toBe('nice');
    expect(garage?.postalCodeText).toBe('06200');
  });
});

describe('parseDetail (Carletta)', () => {
  const stub = parseSitemap(read('sitemap-fr.xml')).find((l) => l.sourceRef === '127');
  const draft = parseDetail(read('fiche-127.html'));

  it('lit les montants en toutes lettres', () => {
    expect(draft?.priceText).toBe('1008 € CC par mois');
    expect(draft?.chargesText).toBe('178 €');
    expect(draft?.depositText).toBe('830 €');
    expect(draft?.feesText).toBe('700.57 €');
    expect(draft?.roomsText).toBe('2 pièces');
    expect(draft?.description).toMatch(/^A LOUER 2 PIECES VIDE/);
    expect(draft?.imageUrls?.[0]).toMatch(/^https:\/\/www\.carletta\.fr\/photos\/biens\/127-1\//);
  });

  it('se normalise', () => {
    const normalized = normalizeListing({ ...stub, ...draft } as NonNullable<typeof stub>, {
      sourceId: 'carletta',
      nowMs: Date.parse('2026-09-14T12:00:00Z'),
    });
    expect(normalized?.price).toBe(1008);
    expect(normalized?.charges).toBe(178);
    expect(normalized?.area).toBe(53.89);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.postalCode).toBe('06200');
    expect(normalized?.propertyType).toBe('apartment');
  });

  it('refuse une page sans loyer au mois', () => {
    expect(parseDetail('<html><body><h1>Appartement</h1></body></html>')).toBeNull();
  });
});
