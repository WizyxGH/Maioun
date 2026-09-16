import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Cartes et fiche réelles du 2026-09-15, allégées et anonymisées.
const read = fixtureReader('imodirect');
const FICHE_URL =
  'https://annonces.imodirect.com/annonces/annonceview/6144/appartement-nice-06100-m2-2-pieces-meuble';

describe('parseList (Imodirect)', () => {
  it('ne garde que les cartes de la zone', () => {
    const listings = parseList(read('annonces.html'));
    // Beausoleil (06240) et les communes hors département sont écartés.
    expect(listings.map((l) => [l.sourceRef, l.cityText, l.postalCodeText])).toEqual([
      ['6144', 'NICE', '06100'],
      ['5855', 'NICE', '06200'],
    ]);
    expect(listings[0]?.sourceUrl).toBe(FICHE_URL);
  });
});

describe('parseDetail (Imodirect)', () => {
  const draft = parseDetail(read('fiche-6144.html'));

  it('lit la fiche', () => {
    expect(draft).toMatchObject({
      priceText: '1075 € CC',
      chargesText: '87 €',
      feesText: '695,49 €',
      areaText: '53,01 m²',
      roomsText: '2 pièces',
      propertyTypeText: 'Appartement',
      cityText: 'NICE',
      postalCodeText: '06100',
      availableAtText: '19/09/26',
      extra: { reference: 'AN006144', quartier: 'Saint-Lambert', dpe: 'D' },
    });
    expect(draft?.furnishedText).toMatch(/Meublé/);
    expect(draft?.description).toMatch(
      /^À louer – Grand 2 pièces[\s\S]+à découvrir sans tarder !$/,
    );
    expect(draft?.imageUrls).toHaveLength(10);
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      { sourceRef: '6144', sourceUrl: FICHE_URL, ...draft },
      { sourceId: 'imodirect', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1075);
    expect(normalized?.area).toBe(53.01);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.city).toBe('nice');
  });

  it('refuse une page sans loyer', () => {
    expect(parseDetail('<html><body>Annonce indisponible</body></html>')).toBeNull();
  });
});
