import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';

// Liste et fiche réelles du 2026-09-15, allégées.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/altarea-nice');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
const FICHE_URL = 'https://altarea.flatbay.fr/fr/property/show/99539';

describe('parseList (Altarea Nice)', () => {
  const listings = parseList(read('search-nice.html'));

  it('extrait les cartes de l’établissement de Nice', () => {
    expect(listings).toHaveLength(8);
    expect(listings.filter((l) => l.cityText === 'Nice').map((l) => l.sourceRef)).toEqual(
      expect.arrayContaining(['99539', '97279']),
    );
    expect(listings.find((l) => l.sourceRef === '99539')).toMatchObject({
      sourceUrl: FICHE_URL,
      cityText: 'Nice',
      postalCodeText: '06200',
    });
  });
});

describe('parseDetail (Altarea Nice)', () => {
  const draft = parseDetail(read('fiche-99539.html'));

  it('lit le JSON-LD, les conditions et les photos', () => {
    expect(draft).toMatchObject({
      title: 'NICE OUEST SIMONE VEIL',
      priceText: '1 060,00 € / mois cc',
      chargesText: '110,00 €',
      depositText: '950,00 €',
      feesText: '713,83 € TTC',
      areaText: '44.2 m²',
      roomsText: '2 pièces',
      propertyTypeText: 'Appartement 2 pièces à Nice',
      addressText: '43 Avenue Simone Veil',
      cityText: 'Nice',
      postalCodeText: '06200',
      availableAtText: 'Dès maintenant',
      publishedAtText: '2026-08-21',
      extra: { reference: '99539', dpe: 'A', bail: '3 ans' },
    });
    expect(draft?.description).toMatch(/^JOIA HANA C702\nAu coeur d'un quartier[\s\S]+170 euros$/);
    expect(draft?.imageUrls?.[0]).toBe('https://altarea.flatbay.fr/fr/document/picture/56899076');
    expect(draft?.imageUrls).toHaveLength(5);
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      { sourceRef: '99539', sourceUrl: FICHE_URL, ...draft },
      { sourceId: 'altarea-nice', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1060);
    expect(normalized?.area).toBe(44.2);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.city).toBe('nice');
  });

  it('refuse une fiche sans loyer mensuel', () => {
    expect(parseDetail('<html><body>Vente 250 000 €</body></html>')).toBeNull();
  });
});
