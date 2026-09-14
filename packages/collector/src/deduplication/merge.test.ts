/** Fusion de l'état de candidature en ligne entre occurrences d'un même logement. */

import { describe, expect, it } from 'vitest';
import type { ApplicationStatus, NormalizedListing } from '@maioun/shared';
import { EMPTY_CONTACT } from '@maioun/shared';
import { occurrenceHash } from '../db/repository.js';
import { mergeApplicationStatus, mergeGroup } from './merge.js';

const BASE_TIME = '2026-09-14T12:00:00.000Z';

function occurrence(id: string, applicationStatus?: ApplicationStatus | null): NormalizedListing {
  return {
    id,
    sourceId: id.split(':')[0] ?? 'test',
    sourceRef: id,
    sourceUrl: `https://example.invalid/${id}`,
    title: 'Appartement T2 Nice',
    description: null,
    price: 690,
    charges: null,
    chargesIncluded: null,
    area: 34,
    rooms: 2,
    bedrooms: null,
    propertyType: 'apartment',
    furnished: null,
    flatShare: null,
    dpe: null,
    previousPrice: null,
    maxOccupants: null,
    features: [],
    address: null,
    district: null,
    city: 'nice',
    postalCode: '06000',
    latitude: null,
    longitude: null,
    contact: { ...EMPTY_CONTACT },
    publishedAt: null,
    availableAt: null,
    imageUrls: [],
    views: null,
    favorites: null,
    ...(applicationStatus !== undefined ? { applicationStatus } : {}),
    firstSeenAt: BASE_TIME,
    lastSeenAt: BASE_TIME,
    scrapedAt: BASE_TIME,
    lifecycle: 'active',
  };
}

describe('mergeApplicationStatus', () => {
  it('complet seulement si toutes les sources qui savent disent complet', () => {
    expect(mergeApplicationStatus([occurrence('foncia:1', 'full'), occurrence('seloger:1')])).toBe(
      'full',
    );
    expect(
      mergeApplicationStatus([occurrence('foncia:1', 'full'), occurrence('autre:1', 'full')]),
    ).toBe('full');
  });

  it('ouvert dès qu’une source dit ouvert', () => {
    expect(
      mergeApplicationStatus([occurrence('foncia:1', 'full'), occurrence('autre:1', 'open')]),
    ).toBe('open');
  });

  it('inconnu quand aucune source ne sait', () => {
    expect(mergeApplicationStatus([occurrence('seloger:1'), occurrence('pap:1', null)])).toBeNull();
  });

  it('est porté par la fiche fusionnée', () => {
    expect(mergeGroup([occurrence('foncia:1', 'full')]).applicationStatus).toBe('full');
    expect(mergeGroup([occurrence('seloger:1')]).applicationStatus).toBeNull();
  });
});

describe('occurrenceHash et état de candidature', () => {
  it('change quand l’état change, dans les deux sens', () => {
    const full = occurrenceHash(occurrence('foncia:1', 'full'));
    expect(occurrenceHash(occurrence('foncia:1', 'open'))).not.toBe(full);
    expect(occurrenceHash(occurrence('foncia:1', null))).not.toBe(full);
  });

  it('ne change pas l’empreinte des annonces sans état connu', () => {
    expect(occurrenceHash(occurrence('seloger:1', null))).toBe(
      occurrenceHash(occurrence('seloger:1')),
    );
  });
});
