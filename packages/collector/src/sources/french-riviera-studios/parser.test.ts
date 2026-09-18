import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Liste et fiche réelles du 2026-09-15, allégées et anonymisées.
const read = fixtureReader('french-riviera-studios');

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

  it('situe le bien par les coordonnées du JSON-LD, seul repère publié', () => {
    expect(draft?.latitude).toBeCloseTo(43.69324, 5);
    expect(draft?.longitude).toBeCloseTo(7.24708, 5);
    // Le site s'arrête à la commune : aucune rue à inventer.
    expect(draft?.addressText).toBeUndefined();
  });

  it('additionne honoraires et état des lieux, et date la mise en ligne', () => {
    expect(draft?.feesText).toBe('320 €');
    expect(draft?.publishedAtText).toBe('2024-10-08T07:12:44+00:00');
  });

  it('ignore les zéros que le thème imprime dans un champ vide', () => {
    // La fiche affiche « Étage 0 » et « Chambre 0 » sans les avoir renseignés.
    expect(draft?.extra?.['etage']).toBeUndefined();
    const fourth = read('f2-nice-beaumettes.html').replace(
      '<strong>Étage</strong> <span>0</span>',
      '<strong>Étage</strong> <span>4</span>',
    );
    expect(parseDetail(fourth)?.extra?.['etage']).toBe('4');
  });

  it('ne retient pas l’état des lieux seul comme honoraires', () => {
    const html = read('f2-nice-beaumettes.html').replace(
      '<strong>Honoraires à la charge du locataire</strong> <span>260 €</span>',
      '',
    );
    expect(parseDetail(html)?.feesText).toBeUndefined();
  });

  it('lit « Location meublée » dans le tableau autant que dans les étiquettes', () => {
    expect(draft?.furnishedText).toBeUndefined();
    const html = read('f2-nice-beaumettes.html').replace(
      '<span>Location</span>',
      '<span>Location meublée, Location</span>',
    );
    expect(parseDetail(html)?.furnishedText).toBe('Meublé');
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
    expect(normalized?.latitude).toBeCloseTo(43.69324, 5);
    expect(normalized?.longitude).toBeCloseTo(7.24708, 5);
    expect(normalized?.tenantFees).toBe(320);
    expect(normalized?.publishedAt).toBe('2024-10-08T07:12:44.000Z');
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
