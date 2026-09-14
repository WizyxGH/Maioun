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
    deposit: null,
    tenantFees: null,
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

describe('dépôt de garantie, honoraires et charges comprises', () => {
  it('prend le dépôt là où il est publié, et garde le désaccord', () => {
    const merged = mergeGroup([
      { ...occurrence('seloger:1'), deposit: null, tenantFees: 220 },
      { ...occurrence('paruvendu:1'), deposit: 660, tenantFees: 250 },
    ]);
    expect(merged.deposit.value).toBe(660);
    expect(merged.deposit.sourceId).toBe('paruvendu');
    expect(merged.tenantFees.value).toBe(220);
    expect(merged.tenantFees.conflicts).toEqual([
      expect.objectContaining({ value: 250, sourceId: 'paruvendu' }),
    ]);
  });

  it('suit la mention « charges comprises » de la source du loyer retenu', () => {
    const merged = mergeGroup([
      { ...occurrence('pap:1'), price: null, chargesIncluded: false },
      { ...occurrence('bienici:1'), price: 720, chargesIncluded: true },
    ]);
    expect(merged.price.value).toBe(720);
    expect(merged.chargesIncluded).toBe(true);
    expect(mergeGroup([{ ...occurrence('pap:1'), price: null }]).chargesIncluded).toBeNull();
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

  it('change quand un dépôt ou des honoraires apparaissent', () => {
    const base = occurrenceHash(occurrence('paruvendu:1'));
    expect(occurrenceHash({ ...occurrence('paruvendu:1'), deposit: 660 })).not.toBe(base);
    expect(occurrenceHash({ ...occurrence('paruvendu:1'), tenantFees: 0 })).not.toBe(base);
  });
});
