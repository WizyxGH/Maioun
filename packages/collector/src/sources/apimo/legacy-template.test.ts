import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { AGENCE_CASTEL } from '../agence-castel/index.js';
import { isEmptyList, parseDetail, parseList } from './legacy-template.js';
import { fixtureReader, readFixture } from '../../../../../tests/helpers/fixtures.js';

// Pages réelles du 2026-09-15, allégées. Aucune location publiée : la fiche de
// vente est convertie en location pour éprouver le parseur.
const read = fixtureReader('agence-castel');

const URL =
  'http://www.agencecastel.com/fr/recherche/location-appartement-2-pieces-nice-le-port-06300-4401705';

/** La fiche de vente, habillée en location. */
const rental = (): string =>
  read('fiche-vente.html')
    .replace('nature-1', 'nature-2')
    .replace('<li>550 000 €</li>', '<li>1 200 € / mois</li>')
    .replace(
      '<li class="alt">Honoraires à charge vendeur</li>',
      '<li class="alt">Dépôt de garantie<span>1 100 €</span></li>' +
        '<li>Provision sur charges<span>100 € / Mois</span></li>' +
        '<li>Honoraires à charge locataire<span>780 €</span></li>',
    );

describe('parseList (Agence Castel)', () => {
  it('rend une recherche vide sans erreur', () => {
    expect(parseList(read('location.html'), AGENCE_CASTEL)).toEqual([]);
  });

  it('reconnaît le bloc « Aucun résultat » des deux agences, et lui seul', () => {
    expect(isEmptyList(read('location.html'))).toBe(true);
    expect(isEmptyList(readFixture('cdc-immobilier', 'location.html'))).toBe(true);
    expect(isEmptyList(read('vente.html'))).toBe(false);
    // Le même texte en attribut du sélecteur de ville ne compte pas.
    expect(isEmptyList('<select data-noResults="Aucun résultat"></select>')).toBe(false);
  });

  it('écarte les ventes et lit les cartes de location', () => {
    const sale = read('vente.html');
    expect(parseList(sale, AGENCE_CASTEL)).toEqual([]);
    const listings = parseList(
      sale.replaceAll('/fr/recherche/vente-', '/fr/recherche/location-'),
      AGENCE_CASTEL,
    );
    expect(listings).toHaveLength(3);
    expect(listings[0]?.sourceRef).toMatch(/^\d{8}$/);
    expect(listings[0]?.sourceUrl).toMatch(
      /^http:\/\/www\.agencecastel\.com\/fr\/recherche\/location-/,
    );
    expect(listings[0]?.cityText).toBe('Nice');
  });
});

describe('parseDetail (Agence Castel)', () => {
  const stub = { sourceRef: '87073055', sourceUrl: URL, cityText: 'Nice' };

  it('refuse une vente', () => {
    expect(parseDetail(read('fiche-vente.html'), stub, AGENCE_CASTEL)).toBeNull();
  });

  it('lit loyer, montants, résumé, photos et DPE', () => {
    const draft = parseDetail(rental(), stub, AGENCE_CASTEL);
    expect(draft?.priceText).toBe('1 200 € / mois');
    expect(draft?.depositText).toBe('1 100 €');
    expect(draft?.chargesText).toBe('100 € / Mois');
    expect(draft?.feesText).toBe('780 €');
    expect(draft?.areaText).toBe('42 m²');
    expect(draft?.roomsText).toBe('2 pièces, 1 chambres');
    expect(draft?.propertyTypeText).toBe('Appartement');
    expect(draft?.furnishedText).toBe('meublé');
    expect(draft?.postalCodeText).toBe('06300');
    expect(draft?.availableAtText).toBe('Libre');
    expect(draft?.extra).toMatchObject({ reference: '87073055', quartier: 'Le Port', dpe: 'B' });
    expect(draft?.description).toMatch(/^Situé à proximité[\s\S]+sans tarder!$/);
    expect(draft?.imageUrls).toHaveLength(7);
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      { ...stub, ...parseDetail(rental(), stub, AGENCE_CASTEL) },
      { sourceId: 'agence-castel', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1200);
    expect(normalized?.charges).toBe(100);
    expect(normalized?.deposit).toBe(1100);
    expect(normalized?.area).toBe(42);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.bedrooms).toBe(1);
    expect(normalized?.furnished).toBe(true);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.dpe).toBe('B');
  });
});
