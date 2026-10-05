import { describe, expect, it } from 'vitest';
import type { NormalizedListing } from '@maioun/shared';
import { EMPTY_CONTACT } from '@maioun/shared';
import { DEFAULT_POSITION_MIN_LISTINGS, withoutDefaultPositions } from './default-positions.js';

const BASE_TIME = '2026-10-05T12:00:00.000Z';

function occurrence(id: string, over: Partial<NormalizedListing> = {}): NormalizedListing {
  return {
    id,
    sourceId: 'portail',
    sourceRef: id,
    sourceUrl: `https://example.invalid/${id}`,
    title: 'Studio',
    description: null,
    price: 600,
    charges: null,
    chargesIncluded: null,
    deposit: null,
    tenantFees: null,
    area: 25,
    rooms: 1,
    bedrooms: null,
    propertyType: 'apartment',
    furnished: null,
    flatShare: null,
    dpe: null,
    ges: null,
    previousPrice: null,
    maxOccupants: null,
    features: [],
    address: '37 Avenue Fictive',
    district: null,
    city: 'nice',
    postalCode: '06000',
    latitude: 43.7030602,
    longitude: 7.2662467,
    contact: { ...EMPTY_CONTACT },
    publishedAt: null,
    availableAt: null,
    imageUrls: [],
    videoUrl: null,
    views: null,
    favorites: null,
    firstSeenAt: BASE_TIME,
    lastSeenAt: BASE_TIME,
    scrapedAt: BASE_TIME,
    lifecycle: 'active',
    ...over,
  };
}

/** `n` logements distincts de la même source, au même point. */
const empiles = (n: number, over: Partial<NormalizedListing> = {}): NormalizedListing[] =>
  Array.from({ length: n }, (_, rang) =>
    occurrence(`portail:${rang}`, { price: 500 + rang * 10, ...over }),
  );

describe('withoutDefaultPositions', () => {
  it('retire le point et l’adresse que la source pose sur huit logements', () => {
    const corpus = withoutDefaultPositions(empiles(DEFAULT_POSITION_MIN_LISTINGS));
    for (const one of corpus) {
      expect(one.latitude).toBeNull();
      expect(one.longitude).toBeNull();
      expect(one.address).toBeNull();
      // Ce que la source dit d'autre reste : code postal, ville.
      expect(one.postalCode).toBe('06000');
    }
  });

  it('laisse une résidence : quelques logements au même point', () => {
    const corpus = withoutDefaultPositions(empiles(DEFAULT_POSITION_MIN_LISTINGS - 1));
    expect(corpus.every((one) => one.latitude === 43.7030602)).toBe(true);
  });

  it('compte des logements, pas des occurrences : le même bien republié ne pèse qu’une fois', () => {
    const memeBien = Array.from({ length: 12 }, (_, rang) => occurrence(`portail:${rang}`));
    expect(withoutDefaultPositions(memeBien)[0]!.latitude).toBe(43.7030602);
  });

  it('ne mélange pas les sources : chacune a ses défauts', () => {
    const corpus = empiles(DEFAULT_POSITION_MIN_LISTINGS - 1).concat(
      occurrence('autre:1', { sourceId: 'autre', price: 990 }),
    );
    expect(withoutDefaultPositions(corpus).every((one) => one.latitude !== null)).toBe(true);
  });
});
