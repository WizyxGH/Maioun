import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';

// Page des locations et fiche réelles du 2026-09-14, allégées.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/concept-patrimoine');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

describe('parseList (Concept Patrimoine)', () => {
  const listings = parseList(read('locations.html'));

  it('lit chaque carte en entier', () => {
    expect(listings).toHaveLength(9);
    const t3 = listings.find((l) => l.sourceRef === 'antho-gaiete-loc');
    expect(t3?.priceText).toBe('1 600 €/mois CC');
    expect(t3?.cityText).toBe('Nice');
    expect(t3?.roomsText).toBe('3 pièces');
    expect(t3?.areaText).toBe('65 m²');
  });

  it('se normalise, bureaux et parkings typés comme tels', () => {
    const nowMs = Date.parse('2026-09-14T12:00:00Z');
    const types = listings.map(
      (l) => normalizeListing(l, { sourceId: 'concept-patrimoine', nowMs })?.propertyType,
    );
    expect(types.filter((t) => t === 'apartment')).toHaveLength(3);
    expect(types).toContain('parking');
    expect(types).toContain('commercial');
  });
});

describe('parseDetail (Concept Patrimoine)', () => {
  it('ajoute description, référence, charges et honoraires', () => {
    const draft = parseDetail(read('fiche-la2469.html'));
    expect(draft?.chargesText).toBe('50 €');
    expect(draft?.feesText).toBe('169 €');
    expect(draft?.extra).toEqual({ reference: 'LA2469' });
    expect(draft?.description).toMatch(/^NICE \/ FACULTE DE MEDECINE/);
    expect(draft?.imageUrls?.every((u) => u.endsWith('_original.jpg'))).toBe(true);
  });

  it('ne rend rien d’une page vide', () => {
    expect(parseDetail('<html><body></body></html>')).toBeNull();
  });
});
