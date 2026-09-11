import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pageUrlFor, parseDetail, parseListPage } from './parser.js';

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

  it('retient la photo, dans sa plus grande largeur', () => {
    // AUCUNE PHOTO N'ÉTAIT RÉCUPÉRÉE : le parser ne regardait pas les images.
    // LocService les sert en `<picture>` — un `<source>` AVIF par largeur, puis
    // un `<img>` JPEG de repli. On prend le repli, lisible par tout navigateur,
    // et sa plus grande largeur : c'est la même requête.
    const l = listings.find((x) => x.sourceRef === '700001');
    expect(l?.imageUrls).toEqual(['https://img.locservice.fr/ddd/resize:fill:334:188/xxx.jpg']);
  });

  it('se contente du `src` quand il n’y a pas de `srcset`', () => {
    const l = listings.find((x) => x.sourceRef === '700002');
    expect(l?.imageUrls).toEqual(['https://img.locservice.fr/eee/resize:fill:167:94/yyy.jpg']);
  });

  it('n’invente pas de photo quand la carte n’en a pas', () => {
    const l = listings.find((x) => x.sourceRef === '700003');
    expect(l?.imageUrls).toBeUndefined();
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

describe('parseDetail — position (LocService)', () => {
  /** Une fiche réduite à sa description et au script de la carte. */
  const fiche = (script: string): string =>
    `<html><body><div id="accommodation-ad-description"><p>Texte</p></div>` +
    `<script>${script}</script></body></html>`;

  it('lit la position telle que la fiche l’écrit (relevé du 2026-09-11)', () => {
    const detail = parseDetail(
      fiche(`
        window.configData = Object.assign(window.configData || {}, {
            mapContainerSelector: "#accommodation-ad-map",
            carouselContainerSelector: "#accommodation-ad-photos-carousel",
            accommodationCoordinates: [43.6970, 7.2912],
        });`),
    );
    expect(detail?.latitude).toBe(43.697);
    expect(detail?.longitude).toBe(7.2912);
  });

  it('accepte aussi l’écriture JSON', () => {
    const detail = parseDetail(fiche('var c = {"accommodationCoordinates":[ "43.7", "7.26" ]};'));
    expect(detail?.latitude).toBe(43.7);
    expect(detail?.longitude).toBe(7.26);
  });

  it('n’invente rien quand la fiche ne donne pas de position', () => {
    const detail = parseDetail(fiche('window.configData = {};'));
    expect(detail).not.toBeNull();
    expect(detail?.latitude).toBeUndefined();
    expect(detail?.longitude).toBeUndefined();
  });

  it.each([
    ['[0, 0]', '[0, 0]'],
    ['un ordre inversé', '[7.2912, 43.6970]'],
    ['un point hors du département', '[48.8566, 2.3522]'],
    ['des valeurs nulles', '[null, null]'],
    ['du texte', '["abc", "def"]'],
    ['une seule valeur', '[43.6970]'],
  ])('écarte %s', (_label, value) => {
    const detail = parseDetail(fiche(`({ accommodationCoordinates: ${value} })`));
    expect(detail?.latitude).toBeUndefined();
    expect(detail?.longitude).toBeUndefined();
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
