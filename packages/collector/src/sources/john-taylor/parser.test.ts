import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { detailUrl, parseDetail, parseList } from './parser.js';

// Liste Côte d'Azur et fiche réelles du 2026-09-15, allégées et anonymisées.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/john-taylor');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

const CAGNES =
  'https://www.john-taylor.fr/france/location/maison-villa-propriete/cote-d-azur/saint-paul-de-vence-et-ses-environs/cagnes-sur-mer/L0603LC/';

describe('parseList (John Taylor)', () => {
  const listings = parseList(read('location-cote-d-azur.html'));

  it('lit les quatre cartes avec loyer mensuel, commune et pictogrammes', () => {
    expect(listings.map((l) => l.sourceRef)).toEqual(['L0893CA', 'L0533LC', 'L0603LC', 'L0151LC']);
    expect(listings.find((l) => l.sourceRef === 'L0533LC')).toMatchObject({
      priceText: '7900 € / mois',
      areaText: '280 m²',
      roomsText: '6 Pièces',
      propertyTypeText: 'Maison',
      cityText: 'Mougins',
      postalCodeText: '06250',
    });
    expect(listings.find((l) => l.sourceRef === 'L0603LC')).toMatchObject({
      sourceUrl: CAGNES,
      title: 'Location Maison Cagnes-sur-Mer',
      contactFormUrl: `${CAGNES}#contact`,
    });
  });

  it('ne donne pas de loyer à un « Prix sur demande »', () => {
    expect(listings.find((l) => l.sourceRef === 'L0893CA')?.priceText).toBeUndefined();
  });

  it('ne lit que les fiches de la zone', () => {
    const urls = listings.map((l) => detailUrl(l));
    expect(urls).toEqual([null, null, CAGNES, expect.stringContaining('/vence/L0151LC/')]);
  });
});

describe('parseDetail (John Taylor)', () => {
  const draft = parseDetail(read('fiche-L0603LC.html'));

  it('lit la fiche', () => {
    expect(draft).toMatchObject({
      title: 'Élégante villa avec piscine et jardin exotique – Proche centre et mer',
      priceText: '8000 € / mois',
      depositText: '14 000 €',
      feesText: '7 000 €',
      roomsText: '5 Pièces',
      propertyTypeText: 'Maison',
      cityText: 'Cagnes-sur-Mer',
      postalCodeText: '06800',
      phoneText: '+33 6 00 00 00 01',
      extra: {
        reference: 'L0603LC',
        chambres: '4 Chambres',
        agence: 'John Taylor Location Countryside',
      },
    });
    expect(draft?.description).toMatch(/^Située à Cagnes-sur-Mer[\s\S]+Honoraires locataires/);
    expect(draft?.imageUrls).toHaveLength(3);
    expect(draft?.imageUrls?.[0]).toMatch(/^https:\/\/www\.john-taylor\.fr\/.+\.jpg$/);
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      { sourceRef: 'L0603LC', sourceUrl: CAGNES, ...draft },
      { sourceId: 'john-taylor', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(8000);
    expect(normalized?.rooms).toBe(5);
    expect(normalized?.deposit).toBe(14000);
    expect(normalized?.city).toBe('cagnes sur mer');
  });

  it('refuse une fiche sans loyer mensuel', () => {
    const weekly = read('fiche-L0603LC.html').replace('> / Mois<', '> / Semaine<');
    expect(parseDetail(weekly)).toBeNull();
    expect(parseDetail('<html><body></body></html>')).toBeNull();
  });
});
