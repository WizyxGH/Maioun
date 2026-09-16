import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Liste et fiches réelles du 2026-09-15, allégées.
const read = fixtureReader('la-franco-suisse');

describe('parseList (La Franco Suisse)', () => {
  const listings = parseList(read('locations.html'));

  it('extrait les quatre locations une seule fois, adresse en minuscules', () => {
    expect(listings.map((l) => l.sourceRef).sort()).toEqual([
      '349736',
      '4104219',
      '4316879',
      '85952948',
    ]);
    expect(listings.find((l) => l.sourceRef === '85952948')?.sourceUrl).toBe(
      'https://www.lafrancosuisse.com/fr/location/appartement/nice/3-pieces/lepante/reference-85952948/',
    );
  });
});

describe('parseDetail (La Franco Suisse)', () => {
  it('lit le tableau « Détails » et la description', () => {
    const draft = parseDetail(read('fiche-85952948.html'));
    expect(draft?.priceText).toBe('1.517 € hors charges par mois');
    expect(draft?.chargesText).toBe('45 €');
    expect(draft?.depositText).toBe('3 034 €');
    expect(draft?.feesText).toBe('981,50 €');
    expect(draft?.cityText).toBe('Nice');
    expect(draft?.extra).toEqual({
      reference: '85952948',
      district: 'Lepante',
      bedrooms: '2',
      dpe: 'E',
    });
    expect(draft?.description).toMatch(
      /^Nice Plein Centre[\s\S]+Géorisques : georisques\.gouv\.fr$/,
    );
    expect(draft?.imageUrls).toEqual([
      'https://www.lafrancosuisse.com/photos/appartement-3pieces-a-louer-lepante-nice-152414094.jpg',
    ]);

    const normalized = normalizeListing(
      { sourceRef: '85952948', sourceUrl: 'https://www.lafrancosuisse.com/', ...draft },
      { sourceId: 'la-franco-suisse', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1517);
    expect(normalized?.charges).toBe(45);
    expect(normalized?.area).toBe(75.5);
    expect(normalized?.rooms).toBe(3);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.propertyType).toBe('apartment');
    expect(normalized?.furnished).toBe(true);
  });

  it('ne donne pas de surface nulle à un garage', () => {
    const draft = parseDetail(read('fiche-349736.html'));
    expect(draft?.priceText).toBe('130 € par mois');
    expect(draft?.areaText).toBeUndefined();
    expect(draft?.feesText).toBe('130€');
    expect(draft?.propertyTypeText).toBe('garage');
    expect(draft?.imageUrls).toHaveLength(2);
  });

  it('refuse une fiche sans loyer mensuel', () => {
    expect(parseDetail('<html><body><h1>Vente</h1></body></html>')).toBeNull();
  });
});
