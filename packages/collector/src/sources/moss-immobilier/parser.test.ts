import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Liste et fiche réelles du 2026-09-15, allégées.
const read = fixtureReader('moss-immobilier');

describe('parseList (Moss Immobilier)', () => {
  const listings = parseList(read('location.html'));

  it('extrait les sept cartes par leur référence Apimo', () => {
    expect(listings).toHaveLength(7);
    expect(listings[1]).toMatchObject({
      sourceRef: '87246480',
      sourceUrl: 'https://mossimmobilier.com/properties/location-cessole-2-pieces-42m2-meuble/',
    });
  });
});

describe('parseDetail (Moss Immobilier)', () => {
  const draft = parseDetail(read('fiche-87246480.html'));

  it('lit prix, liste de caractéristiques et montants de la description', () => {
    expect(draft?.priceText).toBe('1.100 € CC par mois');
    expect(draft?.chargesText).toBe('200 €');
    expect(draft?.depositText).toBe('1800 €');
    expect(draft?.feesText).toBe('546€');
    expect(draft?.cityText).toBe('Nice');
    expect(draft?.postalCodeText).toBe('06300');
    expect(draft?.extra).toEqual({ reference: '87246480' });
    expect(draft?.description).toMatch(/^Notre agence immobilière[\s\S]+: 546€$/);
    expect(draft?.imageUrls).toHaveLength(8);
    expect(draft?.imageUrls?.[0]).toMatch(
      /^https:\/\/mossimmobilier\.com\/wp-content\/uploads\/.+-original\.jpg$/,
    );
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      { sourceRef: '87246480', sourceUrl: 'https://mossimmobilier.com/', ...draft },
      { sourceId: 'moss-immobilier', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1100);
    expect(normalized?.chargesIncluded).toBe(true);
    expect(normalized?.area).toBe(42.85);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.propertyType).toBe('apartment');
  });

  it('refuse une fiche qui n’est pas une location', () => {
    const sale = read('fiche-87246480.html').replace(
      '<dd class="apimo_property_value">Location</dd>',
      '<dd class="apimo_property_value">Vente</dd>',
    );
    expect(parseDetail(sale)).toBeNull();
  });
});
