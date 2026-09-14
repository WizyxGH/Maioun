import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';

// Recherche et fiche réelles du 2026-09-14, allégées.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/griguer');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

describe('parseList (Griguer)', () => {
  it('extrait les sept fiches, sans la page d’archive', () => {
    const refs = parseList(read('recherche-location.html')).map((l) => l.sourceRef);
    expect(refs).toHaveLength(7);
    expect(refs).toContain('location-2-pieces-nice-cap-de-croix-scuderi');
  });
});

describe('parseDetail (Griguer)', () => {
  const html = read('fiche-l-1362.html');
  const draft = parseDetail(html);

  it('lit la vue d’ensemble, montants à l’anglaise compris', () => {
    expect(draft?.priceText).toBe('1160 € CC par mois');
    expect(draft?.chargesText).toBe('170 €');
    expect(draft?.depositText).toBe('990 €');
    expect(draft?.feesText).toBe('767 €');
    expect(draft?.cityText).toBe('Nice');
    expect(draft?.postalCodeText).toBe('06100');
    expect(draft?.extra).toEqual({ reference: 'L-1362', district: 'Cimiez' });
    expect(draft?.imageUrls).toHaveLength(5);
  });

  it('se normalise, surface lue dans la description', () => {
    const normalized = normalizeListing(
      {
        sourceRef: 'location-2-pieces-nice-cap-de-croix-scuderi',
        sourceUrl:
          'https://griguer-immobilier.com/biens/location-2-pieces-nice-cap-de-croix-scuderi/',
        ...draft,
      },
      { sourceId: 'griguer', nowMs: Date.parse('2026-09-14T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1160);
    expect(normalized?.charges).toBe(170);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.area).toBe(58.44);
    expect(normalized?.propertyType).toBe('apartment');
  });

  it('refuse une fiche louée ou en vente', () => {
    expect(
      parseDetail(html.replace('property-status-location', 'property-status-vente')),
    ).toBeNull();
    expect(
      parseDetail(
        html.replace('property-status-location', 'property-status-location property-label-loue'),
      ),
    ).toBeNull();
  });
});
