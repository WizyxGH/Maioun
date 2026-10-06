import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Page de liste du 2026-06-06 (archive), allégée et anonymisée.
const read = fixtureReader('street-immobilier');

describe('parseList (Street Immobilier)', () => {
  const [carte, ...reste] = parseList(read('liste.html'));

  it('lit la carte entière, sans fiche', () => {
    expect(reste).toEqual([]);
    expect(carte).toMatchObject({
      sourceRef: 'STIN233',
      sourceUrl:
        'https://street-immobilier.com/stin233-location-appartement-2-pieces-nice-06000/appartement-775.html',
      priceText: '820 € CC/mois',
      areaText: '31 m²',
      roomsText: '2 pièces',
      addressText: 'AVENUE FERIC',
      cityText: 'Nice',
      postalCodeText: '06000',
      agencyName: 'Street Immobilier',
      phoneText: '06.00.00.00.01',
    });
    expect(carte?.imageUrls?.[0]).toMatch(/^https:\/\/photos\.partagimmo\.com\/.+STIN233/);
  });

  it('se normalise', () => {
    const listing = normalizeListing(carte!, {
      sourceId: 'street-immobilier',
      nowMs: Date.parse('2026-10-06T12:00:00Z'),
    });
    expect(listing?.price).toBe(820);
    expect(listing?.area).toBe(31);
    expect(listing?.rooms).toBe(2);
    expect(listing?.propertyType).toBe('apartment');
    expect(listing?.postalCode).toBe('06000');
  });
});
