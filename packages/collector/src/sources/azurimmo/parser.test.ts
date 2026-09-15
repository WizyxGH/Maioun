import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';

// Liste et fiche réelles du 2026-09-15, allégées et anonymisées.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/azurimmo');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
const URL_FICHE =
  'https://www.azurimmo06.net/biens/location-appartement-1piece-nice-06200-87286959';

describe('parseList (Azurimmo)', () => {
  const listings = parseList(read('liste.html'));

  it('ne garde que les cartes de location', () => {
    expect(listings.map((l) => l.sourceRef)).toEqual(['87286959']);
    expect(listings[0]?.sourceUrl).toBe(URL_FICHE);
  });

  it('lit la carte', () => {
    expect(listings[0]?.priceText).toBe('680 €');
    expect(listings[0]?.areaText).toBe('17 m²');
    expect(listings[0]?.roomsText).toBe('1 pièce');
    expect(listings[0]?.cityText).toBe('Nice');
  });
});

describe('parseDetail (Azurimmo)', () => {
  const draft = parseDetail(read('fiche.html'), { sourceRef: '87286959', sourceUrl: URL_FICHE });

  it('lit le titre, les informations légales et les photos', () => {
    expect(draft?.title).toBe('STUDIO EN LOCATION');
    expect(draft?.priceText).toBe('720 € charges comprises');
    expect(draft?.chargesText).toBe('40 €');
    expect(draft?.depositText).toBe('680 €');
    expect(draft?.feesText).toBe('221 €');
    expect(draft?.imageUrls).toHaveLength(6);
    expect(draft?.extra).toEqual({ reference: '768' });
    expect(draft?.description).toMatch(/^Proche de toutes commodités[\s\S]*Prestations : Meublé/);
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      { sourceRef: '87286959', sourceUrl: URL_FICHE, ...draft },
      { sourceId: 'azurimmo', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(720);
    expect(normalized?.charges).toBe(40);
    expect(normalized?.area).toBe(17);
    expect(normalized?.rooms).toBe(1);
    expect(normalized?.furnished).toBe(true);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.postalCode).toBe('06200');
  });

  it('refuse une page sans loyer', () => {
    expect(
      parseDetail('<html><body><h1>Rien</h1></body></html>', {
        sourceRef: '1',
        sourceUrl: URL_FICHE,
      }),
    ).toBeNull();
  });
});
