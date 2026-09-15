import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';

// Liste et fiche réelles du 2026-09-15, allégées.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/nestenn-nice-port');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

describe('parseList (Nestenn Nice Port)', () => {
  it('extrait les trois locations par leur identifiant', () => {
    const listings = parseList(read('louer.html'));
    expect(listings.map((l) => l.sourceRef).sort()).toEqual(['39344520', '39646335', '39714198']);
  });
});

describe('parseDetail (Nestenn Nice Port)', () => {
  const draft = parseDetail(read('fiche-39646335.html'), '39646335');

  it('lit le bloc description', () => {
    expect(draft).toMatchObject({
      title: 'A LOUER 3 PIECES VIDE - RIQUIER - BALCONS - CLIMATISATION',
      priceText: '1 500 € CC/Mois',
      depositText: '1300€',
      feesText: '918.79€',
      areaText: '71 m²',
      roomsText: '3 pièces',
      propertyTypeText: 'Appartement',
      cityText: 'Nice',
      postalCodeText: '06300',
      extra: { reference: '1588', mandat: 'CB002' },
    });
    expect(draft?.description).toMatch(
      /^A LOUER 3 PIECES VIDE[\s\S]+Loyer: 1300€ \+ 200€[\s\S]+georisques\.gouv\.fr$/,
    );
    expect(draft?.imageUrls).toHaveLength(6);
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      {
        sourceRef: '39646335',
        sourceUrl:
          'https://immobilier-nice-port.nestenn.com/a-louer-3-pieces-vide-riquier-balcons-climatisation-ref-39646335',
        ...draft,
      },
      { sourceId: 'nestenn-nice-port', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1500);
    expect(normalized?.area).toBe(71);
    expect(normalized?.rooms).toBe(3);
    expect(normalized?.city).toBe('nice');
  });

  it('refuse une fiche à vendre', () => {
    const html =
      '<div id="description"><div class="titre2 blue_color">Appartement à vendre</div><div class="titre1">250 000 €</div></div>';
    expect(parseDetail(html, '1')).toBeNull();
  });
});
