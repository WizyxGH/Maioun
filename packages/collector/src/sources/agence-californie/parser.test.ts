import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Liste et fiche réelles du 2026-09-15, allégées.
const read = fixtureReader('agence-californie');

describe('parseList (Agence Californie)', () => {
  const listings = parseList(read('recherche-a-louer.html'));

  it('extrait les fiches par leur référence Apimo', () => {
    expect(listings.map((l) => l.sourceRef)).toEqual(
      expect.arrayContaining(['86586398', '7420081', '87145599']),
    );
    expect(listings.find((l) => l.sourceRef === '86586398')?.sourceUrl).toBe(
      'https://www.agencecalifornie.fr/bien/t4-86586398-06200/',
    );
  });
});

describe('parseDetail (Agence Californie)', () => {
  const draft = parseDetail(read('fiche-86586398.html'));

  it('lit prix, détails, description et galerie', () => {
    expect(draft?.title).toBe('4 pièces – Corniche Fleurie');
    expect(draft?.priceText).toBe('2 500 € par mois');
    expect(draft?.chargesText).toBe('200 €');
    expect(draft?.feesText).toBe('1 274 €');
    expect(draft?.depositText).toBe('2 300 €');
    expect(draft?.areaText).toBe('98 m²');
    expect(draft?.roomsText).toBe('4 pièces');
    expect(draft?.propertyTypeText).toBe('T4');
    expect(draft?.cityText).toBe('Nice');
    expect(draft?.postalCodeText).toBe('06200');
    expect(draft?.description).toMatch(/^T4 – Nice \(06200\)[\s\S]+viennent compléter ce bien\.$/);
    expect(draft?.imageUrls).toHaveLength(12);
    expect(draft?.extra).toEqual({ reference: '86586398', dpe: 'D', ges: 'B' });
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      {
        sourceRef: '86586398',
        sourceUrl: 'https://www.agencecalifornie.fr/bien/t4-86586398-06200/',
        ...draft,
      },
      { sourceId: 'agence-californie', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(2500);
    expect(normalized?.area).toBe(98);
    expect(normalized?.rooms).toBe(4);
    expect(normalized?.city).toBe('nice');
  });

  it('refuse une fiche à vendre', () => {
    const html =
      '<div class="rh_page__property_price"><p class="status">À vendre</p><p class="price">250 000 €</p></div>';
    expect(parseDetail(html)).toBeNull();
  });
});
