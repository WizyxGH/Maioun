import { describe, expect, it } from 'vitest';
import { parseDetailPage, parseSearchPage } from './parser.js';

const SEARCH_URL = 'https://lamaisonette.fr/recherche';
const DETAIL_URL = 'https://lamaisonette.fr/logements/6ec4c2d0-72ff-4c80-b0ab-2dd9a38f366d';

describe('parser Maisonette', () => {
  it('extrait les annonces publiques de la recherche', () => {
    const parsed = parseSearchPage(
      `<a href="${DETAIL_URL}">T2 35 m² – Nice Nice · 35 m² · T2 Bail mobilité Meublé Disponible dès maintenant 1 000 €/mois</a>`,
      SEARCH_URL,
    );
    expect(parsed.listings).toEqual([
      expect.objectContaining({
        sourceRef: '6ec4c2d0-72ff-4c80-b0ab-2dd9a38f366d',
        cityText: 'Nice',
        areaText: '35 m²',
        priceText: '1000 € / mois',
        furnishedText: 'Meublé',
        extra: { leaseType: 'bail mobilité' },
      }),
    ]);
  });

  it('conserve le texte de la fiche et son lien canonique', () => {
    const parsed = parseDetailPage(
      `<h1>Studio 19 m² – Nice</h1><p>Nice · 19 m² · Studio Bail mobilité Meublé 915 €/mois</p>`,
      DETAIL_URL,
    );
    expect(parsed).toEqual(
      expect.objectContaining({
        sourceRef: '6ec4c2d0-72ff-4c80-b0ab-2dd9a38f366d',
        sourceUrl: DETAIL_URL,
        title: 'Studio 19 m² – Nice',
        description: expect.stringContaining('Bail mobilité'),
      }),
    );
  });
});
