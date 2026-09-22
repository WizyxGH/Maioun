import { describe, expect, it } from 'vitest';
import { parseDetailPage, parseSearchPage } from './parser.js';

const SEARCH_URL = 'https://www.123loger.com/location/nice-06000/appartement/';
const DETAIL_URL = `${SEARCH_URL}6791fe67020c/`;

describe('parser 123Loger', () => {
  it('extrait une annonce Nice depuis la page de recherche', () => {
    const parsed = parseSearchPage(
      `<h1>330 appartements en location à Nice</h1>
       <article><a href="${DETAIL_URL}"><h3>Beau studio 20m² avec mezzanine meublé</h3>
       <span>Nice, (6 000)</span><span>20m2</span><span>1 pièce</span><strong>675 € /mois</strong></a></article>
       <a href="${SEARCH_URL}?page=2">2</a>`,
      SEARCH_URL,
    );

    expect(parsed.listings).toEqual([
      expect.objectContaining({
        sourceRef: '6791fe67020c',
        sourceUrl: DETAIL_URL,
        title: 'Beau studio 20m² avec mezzanine meublé',
        priceText: '675 € / mois',
        areaText: '20',
        roomsText: '1',
        cityText: 'Nice',
        postalCodeText: '06000',
      }),
    ]);
    expect(parsed.hasNextPage).toBe(true);
  });

  it('reprend les faits et la référence publiés sur la fiche', () => {
    const parsed = parseDetailPage(
      `<h1>Beau studio 20m² avec mezzanine meublé et équipé</h1>
       <p>Nice (06000), Alpes-Maritimes</p><p>675 € / mois cc</p>
       <p>20 m2 1 pièce Meublé</p><img src="https://www.123loger.com/photo.webp">`,
      DETAIL_URL,
    );

    expect(parsed).toEqual(
      expect.objectContaining({
        sourceRef: '6791fe67020c',
        title: 'Beau studio 20m² avec mezzanine meublé et équipé',
        priceText: '675 € / mois',
        areaText: '20',
        roomsText: '1',
        furnishedText: 'Meublé',
        extra: { reference: '6791fe67020c' },
      }),
    );
  });
});
