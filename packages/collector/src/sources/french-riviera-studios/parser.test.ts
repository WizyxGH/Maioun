import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';

// Liste et fiche réelles du 2026-09-15, allégées et anonymisées.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/french-riviera-studios');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

describe('parseList (French Riviera Studios)', () => {
  const listings = parseList(read('status-location.html'));

  it('extrait les cartes par leur identifiant WordPress', () => {
    expect(listings).toHaveLength(4);
    expect(new Set(listings.map((l) => l.sourceRef)).size).toBe(4);
    for (const listing of listings) {
      expect(listing.sourceRef).toMatch(/^\d+$/);
      expect(listing.sourceUrl).toMatch(/^https:\/\/studios-nice\.com\/property\/[a-z0-9-]+\/$/);
    }
  });
});

describe('parseDetail (French Riviera Studios)', () => {
  const draft = parseDetail(read('f2-nice-beaumettes.html'));

  it('lit le tableau Détails et le JSON-LD', () => {
    expect(draft?.title).toBe('F2 NICE BEAUMETTES prox FAC DE DROIT');
    expect(draft?.priceText).toBe('710 € par mois');
    expect(draft?.chargesText).toBe('80 €');
    expect(draft?.depositText).toBe('790 €');
    expect(draft?.areaText).toBe('30 m²');
    expect(draft?.roomsText).toBe('2 pièces');
    expect(draft?.cityText).toBe('Nice');
    expect(draft?.postalCodeText).toBe('06000');
    expect(draft?.extra).toEqual({ reference: '85298957' });
    expect(draft?.imageUrls).toHaveLength(5);
    expect(draft?.description).toMatch(/Location longue durée$/);
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      {
        sourceRef: '24965',
        sourceUrl: 'https://studios-nice.com/property/f2-nice-beaumettes/',
        ...draft,
      },
      { sourceId: 'french-riviera-studios', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(710);
    expect(normalized?.area).toBe(30);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.city).toBe('nice');
  });

  it('lit les milliers à l’anglaise', () => {
    const html = read('f2-nice-beaumettes.html').replace('710.00€/mois', '1,160.00€/mois');
    expect(parseDetail(html)?.priceText).toBe('1160 € par mois');
  });

  it('refuse une fiche à la semaine ou sans prix', () => {
    const weekly = read('f2-nice-beaumettes.html').replace('710.00€/mois', '500.00€/semaine');
    expect(parseDetail(weekly)).toBeNull();
    expect(parseDetail('<html><body><h1>Vente studio</h1></body></html>')).toBeNull();
  });
});
