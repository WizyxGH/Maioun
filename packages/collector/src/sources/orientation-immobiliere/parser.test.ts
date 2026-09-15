import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RawListing } from '@maioun/shared';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';

// Liste et fiche réelles du 2026-09-15, allégées.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/orientation-immobiliere');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

describe('parseList (Orientation Immobilière)', () => {
  const listings = parseList(read('resultats-location.html'));

  it('extrait les quatre cartes', () => {
    expect(listings.map((l) => l.sourceRef).sort()).toEqual([
      'GES00210222_821',
      'GES00290121_821',
      'GES00830244_821',
      'GES01240007_821',
    ]);
    expect(listings.find((l) => l.sourceRef === 'GES00290121_821')).toMatchObject({
      sourceUrl: 'https://www.orimnice.fr/location-appartement-1piece-nice-GES00290121_821',
      priceText: '800 € CC*',
      propertyTypeText: 'Appartement',
      cityText: 'Nice',
      areaText: '37 m²',
      roomsText: '1 pièces',
    });
  });
});

describe('parseDetail (Orientation Immobilière)', () => {
  const draft = parseDetail(read('fiche-GES00290121_821.html'));

  it('lit description, caractéristiques et photos', () => {
    expect(draft).toMatchObject({
      priceText: '800 € CC',
      chargesText: '100€',
      feesText: '481 €',
      depositText: '700 €',
      areaText: '37 m²',
      roomsText: '1 pièces',
      extra: { reference: 'GES00290121-821', dpe: 'C' },
    });
    expect(draft?.description).toMatch(/^QUARTIER DU PORT NICE[\s\S]+DPE ANCIENNE VERSION\.$/);
    expect(draft?.imageUrls).toEqual([
      'https://www.orimnice.fr/photobox/ori_ORIM_nic/location/photo/immeuble-8297973375714848337.jpg',
    ]);
  });

  it('se normalise avec la carte', () => {
    const card = parseList(read('resultats-location.html')).find(
      (l) => l.sourceRef === 'GES00290121_821',
    );
    const normalized = normalizeListing({ ...card, ...draft } as RawListing, {
      sourceId: 'orientation-immobiliere',
      nowMs: Date.parse('2026-09-15T12:00:00Z'),
    });
    expect(normalized?.price).toBe(800);
    expect(normalized?.area).toBe(37);
    expect(normalized?.rooms).toBe(1);
    expect(normalized?.city).toBe('nice');
  });

  it('refuse une page sans loyer', () => {
    expect(parseDetail('<html><body>Introuvable</body></html>')).toBeNull();
  });
});
