import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Liste et fiche réelles du 2026-09-14, allégées.
const read = fixtureReader('safi');

describe('parseList (SAFI Méditerranée)', () => {
  it('garde les locations au mois, pas les chalets à la semaine', () => {
    expect(parseList(read('status-location.html')).map((l) => l.sourceRef)).toEqual([
      't3-vide-sainte-marguerite',
      't2-meuble-cimiez-exclusivement-etudiant',
      'f3-bas-de-villa-terron',
    ]);
  });
});

describe('parseDetail (SAFI Méditerranée)', () => {
  const html = read('fiche-t3-sainte-marguerite.html');
  const draft = parseDetail(html);

  it('lit la liste Houzez et l’adresse de rue', () => {
    expect(draft?.priceText).toBe('1.400€ CC par mois');
    expect(draft?.chargesText).toBe('220€');
    expect(draft?.areaText).toBe('61.15 m²');
    expect(draft?.cityText).toBe('Nice');
    expect(draft?.addressText).toBe('18 Impasse de la Gaieté');
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      {
        sourceRef: 't3-vide-sainte-marguerite',
        sourceUrl: 'https://safimediterranee.fr/property/t3-vide-sainte-marguerite/',
        ...draft,
      },
      { sourceId: 'safi', nowMs: Date.parse('2026-09-14T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1400);
    expect(normalized?.charges).toBe(220);
    expect(normalized?.rooms).toBe(3);
    expect(normalized?.city).toBe('nice');
  });

  it('refuse un prix à la semaine', () => {
    expect(parseDetail(html.replaceAll('cc / mois', 'la semaine'))).toBeNull();
  });
});
