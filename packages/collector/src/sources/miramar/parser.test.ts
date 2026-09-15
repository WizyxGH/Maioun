import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';

// Pages réelles du 2026-09-15, allégées. Aucune location publiée : la fiche de
// vente est convertie en location pour éprouver le parseur.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/miramar');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

const rental = (): string =>
  read('fiche-vente.html')
    .replace('type_transaction-vente', 'type_transaction-location')
    .replace('>595 000 €<', '>1 800 €<');

describe('parseList (Miramar)', () => {
  it('rend une grille vide sans erreur', () => {
    expect(parseList(read('locations.html'))).toEqual([]);
  });

  it('écarte les ventes et lit les cartes de location', () => {
    const sale = read('acheter.html');
    expect(parseList(sale)).toEqual([]);
    const listings = parseList(
      sale.replaceAll('type_transaction-vente', 'type_transaction-location'),
    );
    expect(listings).toHaveLength(3);
    expect(listings[0]).toMatchObject({
      sourceRef: '2388',
      sourceUrl: 'https://miramarimmo.com/biens/exclusivite-appartement-lympia-port-de-nice/',
    });
  });
});

describe('parseDetail (Miramar)', () => {
  it('refuse une vente', () => {
    expect(parseDetail(read('fiche-vente.html'))).toBeNull();
  });

  const draft = parseDetail(rental());

  it('lit prix, intertitres, description et photos', () => {
    expect(draft?.priceText).toBe('1 800 €');
    expect(draft?.chargesText).toBe('209€');
    expect(draft?.areaText).toBe('72m²');
    expect(draft?.roomsText).toBe('3 pièces, 2 chambres');
    expect(draft?.propertyTypeText).toBe('Appartement');
    expect(draft?.cityText).toBe('Nice');
    expect(draft?.title).toBe('3 PIECES PORT DE NICE');
    expect(draft?.extra).toMatchObject({ reference: '5239376', quartier: 'Le Port', dpe: 'B' });
    expect(draft?.description).toMatch(/^Port de Nice\.[\s\S]+Garage et 2 caves\.$/);
    expect(draft?.imageUrls).toHaveLength(9);
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      { sourceRef: '2809', sourceUrl: 'https://miramarimmo.com/biens/x/', ...draft },
      { sourceId: 'miramar', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1800);
    expect(normalized?.charges).toBe(209);
    expect(normalized?.area).toBe(72);
    expect(normalized?.rooms).toBe(3);
    expect(normalized?.bedrooms).toBe(2);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.dpe).toBe('B');
  });

  it('laisse la normalisation écarter un tarif à la semaine', () => {
    const weekly = parseDetail(rental().replace('>1 800 €<', '>1 800 € / semaine<'));
    expect(
      normalizeListing(
        { sourceRef: '2809', sourceUrl: 'https://miramarimmo.com/biens/x/', ...weekly },
        { sourceId: 'miramar', nowMs: Date.parse('2026-09-15T12:00:00Z') },
      ),
    ).toBeNull();
  });
});
