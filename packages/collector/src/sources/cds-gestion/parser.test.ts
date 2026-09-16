import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { isEmptyList, parseDetail, parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Pages réelles du 2026-09-15, allégées : recherche de location vide, ventes,
// et une location déjà « Loué! » rouverte pour le test.
const read = fixtureReader('cds-gestion');
const open = (): string => read('fiche-louee.html').replace(' Loué! ', ' À Louer ');

describe('parseList (CDS Gestion)', () => {
  it('rend une recherche vide sans erreur', () => {
    expect(parseList(read('a-louer.html'))).toEqual([]);
  });

  it('reconnaît l’alerte « Aucun résultat », absente d’une recherche pleine', () => {
    expect(isEmptyList(read('a-louer.html'))).toBe(true);
    expect(isEmptyList(read('a-vendre.html'))).toBe(false);
    expect(isEmptyList('<div class="rh_page__listing"></div>')).toBe(false);
  });

  it('écarte les ventes et lit les cartes à louer', () => {
    const sale = read('a-vendre.html');
    expect(parseList(sale)).toEqual([]);
    const listings = parseList(sale.replace(' À Vendre ', ' À Louer '));
    expect(listings).toEqual([
      expect.objectContaining({
        sourceRef: '27669',
        sourceUrl:
          'https://www.cdsgestion.com/property/nice-saint-sylvestre-tres-beau-t2-a-renover-avec-balcon/',
        propertyTypeText: 'appartement',
      }),
    ]);
  });
});

describe('parseDetail (CDS Gestion)', () => {
  it('refuse une location déjà louée', () => {
    expect(parseDetail(read('fiche-louee.html'))).toBeNull();
  });

  const draft = parseDetail(open());

  it('lit loyer, montants de la description, adresse et photos', () => {
    expect(draft?.priceText).toBe('1.150€ /mois CC');
    expect(draft?.depositText).toBe('1070.00€');
    expect(draft?.feesText).toBe('650.00€');
    expect(draft?.areaText).toBe('50 m2');
    expect(draft?.addressText).toBe('146 Rue de France');
    expect(draft?.cityText).toBe('Nice');
    expect(draft?.postalCodeText).toBe('06000');
    expect(draft?.extra).toMatchObject({ reference: 'CDSMDT-106' });
    expect(draft?.description).toMatch(/^Dans un secteur prisé[\s\S]+650\.00€$/);
    expect(draft?.imageUrls).toHaveLength(7);
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      { sourceRef: '15766', sourceUrl: 'https://www.cdsgestion.com/property/x/', ...draft },
      { sourceId: 'cds-gestion', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1150);
    expect(normalized?.chargesIncluded).toBe(true);
    expect(normalized?.deposit).toBe(1070);
    expect(normalized?.tenantFees).toBe(650);
    expect(normalized?.area).toBe(50);
    expect(normalized?.bedrooms).toBe(1);
    expect(normalized?.city).toBe('nice');
  });
});
