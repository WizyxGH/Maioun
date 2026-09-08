import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pageUrlFor, parseListPage } from './parser.js';

const PAGE_URL = 'https://www.locservice.fr/alpes-maritimes-06/location-nice.html';
const PAGE = readFileSync(
  fileURLToPath(new URL('../../../../../tests/fixtures/locservice/commune.html', import.meta.url)),
  'utf8',
);

describe('parseListPage (LocService)', () => {
  const { listings, warnings } = parseListPage(PAGE, PAGE_URL);

  it('lit chaque annonce et son identifiant', () => {
    expect(listings.map((l) => l.sourceRef)).toEqual(['700001', '700002', '700003']);
    expect(warnings).toEqual([]);
  });

  it('sépare la commune de son code postal', () => {
    const l = listings.find((x) => x.sourceRef === '700001');
    expect(l?.cityText).toBe('Nice');
    expect(l?.postalCodeText).toBe('06000');
    expect(l?.areaText).toBe('31 m²');
    expect(l?.priceText).toBe('850 € / mois');
    expect(l?.description).toContain('Port');
  });

  it('rend les liens relatifs en absolu', () => {
    const l = listings.find((x) => x.sourceRef === '700002');
    expect(l?.sourceUrl).toBe(
      'https://www.locservice.fr/alpes-maritimes-06/location-studio-nice/700002',
    );
    // Virgule décimale : c'est ainsi que la source l'écrit.
    expect(l?.areaText).toBe('18,5 m²');
  });

  /**
   * LES CARACTÉRISTIQUES N'ONT PAS DE CLASSE, hormis le prix : les lire par
   * leur POSITION aurait pris le loyer pour une surface dès qu'une annonce
   * omet la sienne.
   */
  it('ne décale rien quand une caractéristique manque', () => {
    const l = listings.find((x) => x.sourceRef === '700003');
    expect(l?.priceText).toBe('2 100 € / mois');
    expect(l?.areaText).toBeUndefined();
    expect(l?.cityText).toBeUndefined();
  });

  /** §61 : une page de commune vide signale un gabarit changé. */
  it('signale une page devenue muette', () => {
    const vide = parseListPage('<html><body></body></html>', PAGE_URL);
    expect(vide.listings).toEqual([]);
    expect(vide.warnings).toHaveLength(1);
  });
});

describe('pageUrlFor', () => {
  it('laisse la première page sans suffixe', () => {
    expect(pageUrlFor('https://x.invalid/location-nice', 1)).toBe(
      'https://x.invalid/location-nice.html',
    );
    expect(pageUrlFor('https://x.invalid/location-nice', 3)).toBe(
      'https://x.invalid/location-nice-p3.html',
    );
  });
});
