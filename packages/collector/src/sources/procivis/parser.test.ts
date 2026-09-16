import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Liste et fiche réelles du 2026-09-14, allégées.
const read = fixtureReader('procivis');

describe('parseList (Procivis)', () => {
  it('garde les fiches, pas les pages de type ou de commune', () => {
    const listings = parseList(read('louer-appartements-nice.html'));
    expect(listings.map((l) => l.sourceRef).sort()).toEqual([
      '2dh7jsqs',
      '2zuxsk5x',
      'j6nth7df',
      'mxzm9p8b',
    ]);
  });
});

describe('parseDetail (Procivis)', () => {
  const html = read('fiche-2dh7jsqs.html');
  const draft = parseDetail(html);

  it('lit le JSON-LD et les montants du texte', () => {
    expect(draft?.priceText).toBe('1290 € CC par mois');
    expect(draft?.chargesText).toBe('130 €');
    expect(draft?.depositText).toBe('2 320 €');
    expect(draft?.feesText).toBe('590,4 €');
    expect(draft?.agencyName).toBe('Immo de France');
    expect(draft?.extra).toEqual({ reference: '1478', dpe: 'C', ges: 'B' });
    expect(draft?.imageUrls?.[0]).toMatch(/^https:\/\/www\.procivis\.fr\/medias\//);
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      {
        sourceRef: '2dh7jsqs',
        sourceUrl:
          'https://www.procivis.fr/louer/appartements/provence-alpes-cote-d-azur/alpes-maritimes/nice/2dh7jsqs',
        ...draft,
      },
      { sourceId: 'procivis', nowMs: Date.parse('2026-09-14T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1290);
    expect(normalized?.area).toBe(45);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.furnished).toBe(true);
    expect(normalized?.postalCode).toBe('06000');
    expect(normalized?.dpe).toBe('C');
  });

  it('refuse une fiche de vente', () => {
    expect(parseDetail(html.replace('#LeaseOut', '#Sell'))).toBeNull();
  });
});
