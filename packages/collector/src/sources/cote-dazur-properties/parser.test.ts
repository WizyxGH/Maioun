import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { isEmptyList, parseDetail, parseList } from './parser.js';

// Pages réelles du 2026-09-15, allégées. Aucune location publiée : la fiche de
// vente est convertie en location pour éprouver le parseur.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/cote-dazur-properties');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

const rental = (): string =>
  read('fiche-vente.html')
    .replaceAll('À vendre', 'À louer')
    .replace(
      '<span class="price">255 000€</span><span class="price-postfix"></span>',
      '<span class="price">1 150€</span><span class="price-postfix">/mois</span>',
    )
    .replace(
      '<p><strong>Honoraires à la charge du vendeur :</strong> 12&nbsp;750 € (5 %).</p>',
      '<p><strong>Loyer charges comprises :</strong> 1 150 €.</p>' +
        '<p><strong>Provision sur charges :</strong> 120 € par mois.</p>' +
        '<p><strong>Dépôt de garantie :</strong> 1 030 €.</p>' +
        '<p><strong>Honoraires à la charge du locataire :</strong> 616 €.</p>',
    );

describe('parseList (Côte d’Azur Properties)', () => {
  it('rend une recherche vide sans erreur', () => {
    expect(parseList(read('a-louer.html'))).toEqual([]);
  });

  it('reconnaît « No results found », absent d’une recherche pleine', () => {
    expect(isEmptyList(read('a-louer.html'))).toBe(true);
    expect(isEmptyList(read('a-vendre.html'))).toBe(false);
    expect(isEmptyList('<div class="listing-view"></div>')).toBe(false);
  });

  it('écarte les ventes et lit les cartes à louer', () => {
    const sale = read('a-vendre.html');
    expect(parseList(sale)).toEqual([]);
    const listings = parseList(sale.replaceAll('À vendre', 'À louer'));
    expect(listings).toHaveLength(3);
    expect(listings[0]).toMatchObject({
      sourceRef: '4826',
      sourceUrl: 'https://immobilierniceouest.com/property/2-pieces-boulevard-edouard-herriot/',
    });
  });
});

describe('parseDetail (Côte d’Azur Properties)', () => {
  it('refuse une vente', () => {
    expect(parseDetail(read('fiche-vente.html'))).toBeNull();
  });

  const draft = parseDetail(rental());

  it('lit loyer, informations légales, pictogrammes et photos', () => {
    expect(draft?.priceText).toBe('1 150€ /mois CC');
    expect(draft?.chargesText).toBe('120 €');
    expect(draft?.depositText).toBe('1 030 €');
    expect(draft?.feesText).toBe('616 €');
    expect(draft?.areaText).toBe('47.4 m²');
    expect(draft?.roomsText).toBe('2 pièces, 1 chambres');
    expect(draft?.propertyTypeText).toBe('Appartement');
    expect(draft?.cityText).toBe('Nice');
    expect(draft?.extra).toMatchObject({ reference: 'FR6099853', quartier: 'Fabron', dpe: 'D' });
    expect(draft?.description).toMatch(/^Situé sur le secteur[\s\S]+Nice Ouest$/);
    expect(draft?.description).not.toMatch(/Informations légales/);
    expect(draft?.imageUrls).toHaveLength(12);
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      { sourceRef: '4826', sourceUrl: 'https://immobilierniceouest.com/property/x/', ...draft },
      { sourceId: 'cote-dazur-properties', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1150);
    expect(normalized?.chargesIncluded).toBe(true);
    expect(normalized?.deposit).toBe(1030);
    expect(normalized?.area).toBe(47.4);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.bedrooms).toBe(1);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.dpe).toBe('D');
  });
});
