import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';

// Liste et fiche réelles du 2026-09-15, allégées.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/nicolas-pisani');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

describe('parseList (Nicolas Pisani)', () => {
  it('garde les locations à l’année à loyer mensuel', () => {
    const listings = parseList(read('locations.html'));
    expect(listings.length).toBeGreaterThan(0);
    expect(listings[0]).toMatchObject({
      sourceRef: '87094536',
      sourceUrl:
        'https://www.nicolaspisani.com/fr/detail-location/appartement/87094536-appartement-meuble-vue-mer-residence-belle-epoque-cap-dail.cfm',
    });
  });

  it('écarte le saisonnier (cat-3), même affiché au mois', () => {
    const seasonal = read('locations.html').replaceAll('cat-2 ', 'cat-3 ');
    expect(parseList(seasonal)).toEqual([]);
  });
});

describe('parseDetail (Nicolas Pisani)', () => {
  const draft = parseDetail(read('fiche-87067700.html'));

  it('lit loyer, pictogrammes, liste et photos', () => {
    expect(draft?.priceText).toBe('1 500 € / Mois');
    expect(draft?.depositText).toBe('4 500 €');
    expect(draft?.areaText).toBe('28.68 m²');
    expect(draft?.roomsText).toBe('1 pièces, 0 chambres');
    expect(draft?.propertyTypeText).toBe('Appartement');
    expect(draft?.cityText).toBe('Nice');
    expect(draft?.extra).toMatchObject({ reference: '87067700 LA P', dpe: 'D' });
    expect(draft?.description).toMatch(/^Au cœur d'un environnement/);
    expect(draft?.imageUrls).toHaveLength(4);
  });

  it('refuse un loyer à la semaine', () => {
    const weekly = read('fiche-87067700.html').replaceAll('1 500 € / Mois', '1 500 € / Semaine');
    expect(parseDetail(weekly)).toBeNull();
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      {
        sourceRef: '87067700',
        sourceUrl: 'https://www.nicolaspisani.com/fr/detail-location/appartement/87067700.cfm',
        ...draft,
      },
      { sourceId: 'nicolas-pisani', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1500);
    expect(normalized?.deposit).toBe(4500);
    expect(normalized?.area).toBe(28.68);
    expect(normalized?.rooms).toBe(1);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.propertyType).toBe('studio');
  });

  it('garde le loyer d’une villa de prestige, refuse le même sur un studio', () => {
    const normalize = (html: string) =>
      normalizeListing(
        {
          sourceRef: '87067700',
          sourceUrl: 'https://www.nicolaspisani.com/fr/detail-location/villa/87067700.cfm',
          ...parseDetail(html),
        },
        { sourceId: 'nicolas-pisani', nowMs: Date.parse('2026-09-15T12:00:00Z') },
      );
    const luxe = read('fiche-87067700.html').replaceAll('1 500 € / Mois', '25 000 € / Mois');
    expect(normalize(luxe.replace('28.68m2', '420m2'))?.price).toBe(25_000);
    expect(normalize(luxe)?.price).toBeNull();
  });
});
