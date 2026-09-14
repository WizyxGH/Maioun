import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';

// Liste et fiche réelles du 2026-09-14, allégées.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/kapera');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

describe('parseList (Kapera)', () => {
  it('extrait les sept fiches', () => {
    const refs = parseList(read('location-appartement-nice.html')).map((l) => l.sourceRef);
    expect(refs).toHaveLength(7);
    expect(refs).toContain('location-3p-52m2-nice-liberation-vernier');
  });
});

describe('parseDetail (Kapera)', () => {
  const draft = parseDetail(read('fiche-212-pb.html'));

  it('lit les intertitres « Libellé : valeur »', () => {
    expect(draft?.priceText).toBe('1 190 € hors charges par mois');
    expect(draft?.chargesText).toBe('190€');
    expect(draft?.depositText).toBe('1190 €');
    expect(draft?.feesText).toBe('676 €');
    expect(draft?.furnishedText).toBe('meublé');
    expect(draft?.extra).toEqual({ reference: '212 PB', district: 'Vernier', dpe: 'D' });
  });

  it('se normalise, le loyer tel que le site le qualifie', () => {
    const normalized = normalizeListing(
      {
        sourceRef: 'location-3p-52m2-nice-liberation-vernier',
        sourceUrl: 'https://kapera-immobilier.com/biens/location-3p-52m2-nice-liberation-vernier/',
        ...draft,
      },
      { sourceId: 'kapera', nowMs: Date.parse('2026-09-14T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1190);
    expect(normalized?.chargesIncluded).toBe(false);
    expect(normalized?.charges).toBe(190);
    expect(normalized?.area).toBe(52);
    expect(normalized?.rooms).toBe(3);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.dpe).toBe('D');
  });

  it('refuse une fiche sans loyer mensuel', () => {
    expect(parseDetail('<h4 class="elementor-heading-title">Prix : 250 000 €</h4>')).toBeNull();
  });
});
