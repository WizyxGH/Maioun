import { describe, expect, it } from 'vitest';
import { parseDetail, parseList } from '../apimo/legacy-template.js';
import { CDC_IMMOBILIER } from './index.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Pages réelles du 2026-09-15, allégées : recherche de location vide, fiche de vente.
const read = fixtureReader('cdc-immobilier');

describe('CDC Immobilier (gabarit Apimo classique)', () => {
  it('rend une recherche vide sans erreur', () => {
    expect(parseList(read('location.html'), CDC_IMMOBILIER)).toEqual([]);
  });

  it('lit la fiche une fois la transaction en location', () => {
    const url =
      'https://www.cdcimmobilier.com/fr/recherche/location-appartement-2-pieces-nice-liberation-06000-4401421';
    const html = read('fiche-vente.html')
      .replace('nature-1', 'nature-2')
      .replace('<li>249 000 €</li>', '<li>950 € / mois</li>');
    const stub = { sourceRef: '86974794', sourceUrl: url };
    expect(parseDetail(read('fiche-vente.html'), stub, CDC_IMMOBILIER)).toBeNull();
    const draft = parseDetail(html, stub, CDC_IMMOBILIER);
    expect(draft?.priceText).toBe('950 € / mois');
    expect(draft?.areaText).toBe('53 m²');
    expect(draft?.cityText).toBe('Nice Libération');
    expect(draft?.postalCodeText).toBe('06000');
    expect(draft?.agencyName).toBe('CDC Immobilier');
    expect(draft?.imageUrls?.length).toBeGreaterThan(3);
  });
});
