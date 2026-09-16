import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';

// Liste et fiche réelles du 2026-09-14, allégées.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/crouzet-breil');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

describe('parseList (Crouzet & Breil)', () => {
  it('extrait les fiches, dédoublonnées, sans la navigation', () => {
    const refs = parseList(read('liste.html')).map((l) => l.sourceRef);
    expect(refs).toHaveLength(7);
    expect(refs).toContain('a-louer-2-pieces');
    expect(refs).not.toContain('le-cabinet');
  });
});

describe('parseDetail (Crouzet & Breil)', () => {
  const draft = parseDetail(read('fiche.html'));

  it('lit le résumé engendré et la liste des détails', () => {
    expect(draft?.priceText).toBe('995 € CC par mois');
    expect(draft?.chargesText).toBe('110€');
    expect(draft?.depositText).toBe('885€');
    expect(draft?.feesText).toBe('417.22€');
    expect(draft?.extra).toEqual({ reference: '86674738', dpe: 'D', ges: 'D' });
    expect(draft?.cityText).toBe('NICE');
    expect(draft?.imageUrls).toHaveLength(7);
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      {
        sourceRef: 'a-louer-2-pieces',
        sourceUrl: 'https://crouzet-breil.com/l_immobilier/a-louer-2-pieces/',
        ...draft,
      },
      { sourceId: 'crouzet-breil', nowMs: Date.parse('2026-09-14T12:00:00Z') },
    );
    expect(normalized?.price).toBe(995);
    expect(normalized?.charges).toBe(110);
    expect(normalized?.area).toBe(41.3);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.propertyType).toBe('apartment');
    expect(normalized?.city).toBe('nice');
    expect(normalized?.dpe).toBe('D');
  });

  it('refuse une fiche sans loyer mensuel', () => {
    expect(
      parseDetail('<html><body>2 pièces • 41.3 m 2 • 250 000 € • ref. 1</body></html>'),
    ).toBeNull();
  });
});
