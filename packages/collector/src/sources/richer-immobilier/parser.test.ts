import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Liste et fiche réelles du 2026-09-15, allégées.
const read = fixtureReader('richer-immobilier');
const FICHE_URL =
  'https://www.richerimmobilier.com/rl_property/superbe-3-pieces-74-m%c2%b2-avec-terrasse/';

describe('parseList (Richer)', () => {
  it('extrait la location, référence et adresse de fiche', () => {
    const listings = parseList(read('liste-location.html'));
    expect(listings).toHaveLength(1);
    expect(listings[0]?.sourceRef).toBe('51938');
    expect(listings[0]?.sourceUrl).toBe(FICHE_URL);
  });
});

describe('parseDetail (Richer)', () => {
  const draft = parseDetail(read('fiche-5077280.html'));

  it('lit les libellés, les montants de la description et les photos', () => {
    expect(draft?.priceText).toBe('2 000 €');
    expect(draft?.areaText).toBe('74 m²');
    expect(draft?.roomsText).toBe('3 pièces');
    expect(draft?.cityText).toBe('Nice');
    expect(draft?.postalCodeText).toBe('06300');
    expect(draft?.addressText).toBe('8 quai des Docks');
    expect(draft?.chargesText).toBe('317 €');
    expect(draft?.depositText).toBe('2000 €');
    expect(draft?.feesText).toBe('962 €');
    expect(draft?.extra).toEqual({ reference: '5077280', district: 'Le Port' });
    expect(draft?.imageUrls).toHaveLength(7);
    expect(draft?.description).toMatch(/^Port de Nice \/ Le Neptune/);
    expect(draft?.description).toMatch(/Disponible$/);
  });

  it('écarte une fiche de vente', () => {
    const html = read('fiche-5077280.html').replace(
      /(<div class="property_categs">)\s*Location/,
      '$1 Vente',
    );
    expect(parseDetail(html)).toBeNull();
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      { sourceRef: '51938', sourceUrl: FICHE_URL, ...draft },
      { sourceId: 'richer-immobilier', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(2000);
    expect(normalized?.charges).toBe(317);
    expect(normalized?.area).toBe(74);
    expect(normalized?.rooms).toBe(3);
    expect(normalized?.propertyType).toBe('apartment');
    expect(normalized?.city).toBe('nice');
  });
});
