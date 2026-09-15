import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RawListing } from '@maioun/shared';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';

// Liste et fiche réelles du 2026-09-15, allégées.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/forimmo');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

describe('parseList (Forimmo)', () => {
  const listings = parseList(read('resultat-location.html'));
  const rossini = listings.find((l) => l.sourceRef === '0006');

  it('extrait les huit locations', () => {
    expect(listings).toHaveLength(8);
    expect(listings.filter((l) => l.cityText === 'Nice').map((l) => l.sourceRef)).toEqual([
      '0006',
      '116',
      'FR01',
    ]);
  });

  it('lit l’en-tête, le loyer et la description entière de la carte', () => {
    expect(rossini).toMatchObject({
      sourceUrl: 'https://www.forimmo.fr/location-appartement-nice-2pieces-fiche-0006.html',
      title: 'Appartement en location à Nice / 2 pièces 44 m²',
      priceText: '1 160 €',
      propertyTypeText: 'Appartement',
      cityText: 'Nice',
      roomsText: '2 pièces',
      areaText: '44 m²',
    });
    expect(rossini?.description).toMatch(/^Rue Rossini, beau 2 pièces[\s\S]+georisques\.gouv\.fr$/);
  });

  it('n’invente ni pièces ni surface pour un parking', () => {
    const parking = listings.find((l) => l.sourceRef === 'POLM01');
    expect(parking?.roomsText).toBeUndefined();
    expect(parking?.areaText).toBeUndefined();
  });
});

describe('parseDetail (Forimmo)', () => {
  const draft = parseDetail(read('fiche-0006.html'));

  it('ajoute code postal, montants et photos', () => {
    expect(draft).toMatchObject({
      priceText: '1 160 € / mois CC',
      chargesText: '60 €',
      feesText: '572 €',
      depositText: '1 100 €',
      cityText: 'Nice',
      postalCodeText: '06000',
    });
    expect(draft?.imageUrls).toHaveLength(9);
  });

  it('se normalise avec la carte', () => {
    const card = parseList(read('resultat-location.html')).find((l) => l.sourceRef === '0006');
    const normalized = normalizeListing({ ...card, ...draft } as RawListing, {
      sourceId: 'forimmo',
      nowMs: Date.parse('2026-09-15T12:00:00Z'),
    });
    expect(normalized?.price).toBe(1160);
    expect(normalized?.area).toBe(44);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.city).toBe('nice');
  });

  it('ne reprend pas la commune du siège sur une fiche d’une autre commune', () => {
    const card = {
      sourceRef: 'X',
      sourceUrl: 'https://www.forimmo.fr/x',
      cityText: 'Cagnes-sur-mer',
    };
    const other = parseDetail(read('fiche-0006.html'), card);
    expect(other?.cityText).toBeUndefined();
    expect(other?.postalCodeText).toBeUndefined();
  });

  it('refuse une page sans loyer', () => {
    expect(parseDetail('<html><body>Page introuvable</body></html>')).toBeNull();
  });
});
