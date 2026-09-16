import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Liste et fiche réelles du 2026-09-15, allégées et anonymisées.
const read = fixtureReader('barbera-gestion');

describe('parseList (Barbera Gestion)', () => {
  const listings = parseList(read('liste.html'));

  it('ne garde que les cartes « Location »', () => {
    expect(listings.map((l) => l.sourceRef)).toEqual(['87299221', '87299192']);
  });

  it('lit commune, quartier, loyer et surface de la carte', () => {
    const port = listings.find((l) => l.sourceRef === '87299221');
    expect(port?.sourceUrl).toBe('https://www.barbera-gestion.com/offre/propriete-895-87299221');
    expect(port?.cityText).toBe('Nice');
    expect(port?.extra).toEqual({ quartier: 'Le Port' });
    expect(port?.priceText).toBe('1280 € par mois');
    expect(port?.areaText).toBe('42.1 m²');
  });
});

describe('parseDetail (Barbera Gestion)', () => {
  const draft = parseDetail(read('fiche.html'));

  it('lit les tableaux de la fiche', () => {
    expect(draft?.priceText).toMatch(/^1 280,00 € \/mois hors charges$/);
    expect(draft?.chargesText).toBe('80,00 €');
    expect(draft?.depositText).toBe('2 560,00 €');
    expect(draft?.feesText).toBe('553,00 €');
    expect(draft?.roomsText).toBe('2 pièces');
    expect(draft?.imageUrls).toHaveLength(7);
    expect(draft?.extra).toEqual({
      reference: '87299221',
      quartier: 'Le Port',
      dpe: 'E',
      ges: 'C',
    });
    expect(draft?.description).toMatch(
      /^Appartement meublé - Quartier du Port, Nice\n\nSitué au 39/,
    );
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      {
        sourceRef: '87299221',
        sourceUrl: 'https://www.barbera-gestion.com/offre/propriete-895-87299221',
        ...draft,
      },
      { sourceId: 'barbera-gestion', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1280);
    expect(normalized?.charges).toBe(80);
    expect(normalized?.area).toBe(42.1);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.propertyType).toBe('apartment');
    expect(normalized?.city).toBe('nice');
  });

  it('refuse une fiche de vente', () => {
    expect(parseDetail('<div class="lead">Vente</div>')).toBeNull();
  });
});
