import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';

// Liste et fiche réelles du 2026-09-14, allégées.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/mk-immo');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

describe('parseList (MK Immo)', () => {
  const listings = parseList(read('toutes-locations.html'));

  it('extrait les dix locations par leur référence', () => {
    expect(listings).toHaveLength(10);
    expect(listings.map((l) => l.sourceRef)).toContain('795L1111A');
    expect(listings[0]?.sourceUrl).toMatch(/^https:\/\/www\.mk-immo\.fr\/.+-795l28p\.html$/);
  });
});

describe('parseDetail (MK Immo)', () => {
  const draft = parseDetail(read('fiche-795L1111A.html'));

  it('lit les phrases de montants engendrées', () => {
    expect(draft?.priceText).toBe('1 190 € CC par mois');
    expect(draft?.chargesText).toBe('200 €');
    expect(draft?.feesText).toBe('455 €');
    expect(draft?.depositText).toBe('1 980 €');
    expect(draft?.cityText).toBe('Nice');
    expect(draft?.postalCodeText).toBe('06100');
    expect(draft?.extra).toEqual({ dpe: 'C' });
    expect(draft?.imageUrls?.[0]).toMatch(/^https:\/\/medias\.twimmopro\.com\//);
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      {
        sourceRef: '795L1111A',
        sourceUrl: 'https://www.mk-immo.fr/appartement+nice+centre+ville-1-795l1111a.html',
        ...draft,
      },
      { sourceId: 'mk-immo', nowMs: Date.parse('2026-09-14T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1190);
    expect(normalized?.charges).toBe(200);
    expect(normalized?.area).toBe(35);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.dpe).toBe('C');
  });

  it('refuse une fiche sans loyer mensuel', () => {
    expect(parseDetail('<html><body>Vente appartement 250 000 €</body></html>')).toBeNull();
  });
});
