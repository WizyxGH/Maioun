import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Liste et fiche réelles du 2026-09-15, allégées et anonymisées.
const read = fixtureReader('parnasse-immobilier');

describe('parseList (Parnasse Immobilier)', () => {
  const listings = parseList(read('nos-annonces-location.html'));

  it('extrait les huit cartes par leur identifiant', () => {
    expect(listings).toHaveLength(8);
    expect(listings.map((l) => l.sourceRef)).toContain('524734');
    const fiche = listings.find((l) => l.sourceRef === '524734');
    expect(fiche?.sourceUrl).toBe(
      'https://parnasse-immobilier.com/immobilier/nice-nord-vaste-3-pieces-balcon-garage/',
    );
  });
});

describe('parseDetail (Parnasse Immobilier)', () => {
  const draft = parseDetail(read('fiche-524734.html'));

  it('lit les blocs de la fiche', () => {
    expect(draft?.title).toBe('Nice nord vaste 3 pièces balcon garage');
    expect(draft?.priceText).toBe('1 400€ CC');
    expect(draft?.chargesText).toBe('200 €');
    expect(draft?.feesText).toBe('1011 €');
    expect(draft?.depositText).toBe('1200 €');
    expect(draft?.areaText).toBe('76 m²');
    expect(draft?.roomsText).toBe('3 pièces');
    expect(draft?.propertyTypeText).toBe('Appartement');
    expect(draft?.cityText).toBe('Nice');
    expect(draft?.postalCodeText).toBe('06100');
    expect(draft?.description).toMatch(/^Nice Nord , Gorbella[\s\S]+Géorisques/);
    expect(draft?.imageUrls).toHaveLength(12);
    expect(draft?.extra).toEqual({ reference: '87277026', dpe: 'C', ges: 'D' });
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      {
        sourceRef: '524734',
        sourceUrl:
          'https://parnasse-immobilier.com/immobilier/nice-nord-vaste-3-pieces-balcon-garage/',
        ...draft,
      },
      { sourceId: 'parnasse-immobilier', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1400);
    expect(normalized?.area).toBe(76);
    expect(normalized?.rooms).toBe(3);
    expect(normalized?.city).toBe('nice');
  });

  it('refuse une page qui n’est pas une location', () => {
    expect(parseDetail('<html><body><h1 class="entry-title">Vente</h1></body></html>')).toBeNull();
  });
});
