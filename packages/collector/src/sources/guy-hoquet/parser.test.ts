import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { guyHoquetScraper } from './index.js';
import { LIST_URLS, isEmptyList, parseDetail, parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';
import { contextServing } from '../../../../../tests/helpers/scrape-context.js';

// Pages réelles du 2026-09-15, allégées et anonymisées ; une carte cannoise
// ajoutée à la main pour le filtre de zone.
const read = fixtureReader('guy-hoquet');
const URL_1898127 = 'https://www.guy-hoquet.com/location/appartement-2-pieces-nice-06000-1898127';

describe('parseList (Guy Hoquet)', () => {
  const listings = parseList(read('annonces-nice-06000.html'));

  it('lit la carte niçoise une seule fois et écarte celle hors zone', () => {
    expect(listings.map((l) => l.sourceRef)).toEqual(['1898127']);
    expect(listings[0]).toMatchObject({
      sourceUrl: URL_1898127,
      priceText: '1 500 € / mois',
      areaText: '41 m²',
      roomsText: '2 pièces',
      propertyTypeText: 'Appartement',
      cityText: 'NICE',
      postalCodeText: '06000',
    });
    expect(listings[0]?.imageUrls?.[0]).toMatch(/^https:\/\/media\.immo-facile\.com\//);
  });

  it('reconnaît le bandeau « Aucun résultat... » et lui seul', () => {
    const empty = read('annonces-cagnes-sur-mer-06800.html');
    expect(parseList(empty)).toEqual([]);
    expect(isEmptyList(empty)).toBe(true);
    expect(isEmptyList(read('annonces-nice-06000.html'))).toBe(false);
  });
});

describe('parseDetail (Guy Hoquet)', () => {
  const draft = parseDetail(read('fiche-1898127.html'));

  it('lit loyer, charges, dépôt, honoraires et agence', () => {
    expect(draft?.title).toBe(
      'Appartement 2 pièces à louer au dernier étage avec vue dégagée à Nice Musiciens',
    );
    expect(draft?.priceText).toBe('1 500 € / mois charges comprises *');
    expect(draft?.chargesText).toBe('150 €');
    expect(draft?.depositText).toBe('2700 €');
    expect(draft?.feesText).toBe('533.9 €');
    expect(draft?.areaText).toBe('41 m²');
    expect(draft?.roomsText).toBe('2 pièce(s)');
    expect(draft?.cityText).toBe('NICE');
    expect(draft?.postalCodeText).toBe('06000');
    expect(draft?.agencyName).toBe('Guy Hoquet NICE GAMBETTA');
    expect(draft?.phoneText).toBe('06 00 00 00 01');
    expect(draft?.furnishedText).toMatch(/^Location meublée/);
    expect(draft?.description).toMatch(/^Au coeur du très recherché quartier des Musiciens/);
    expect(draft?.imageUrls).toHaveLength(8);
    expect(draft?.extra?.['reference']).toBe('671');
    expect(draft?.extra?.['dpe']).toBe('E');
    expect(draft?.extra?.['features']).toContain('Etage : 7');
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      { sourceRef: '1898127', sourceUrl: URL_1898127, ...draft },
      { sourceId: 'guy-hoquet', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1500);
    expect(normalized?.area).toBe(41);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.city).toBe('nice');
  });

  it('refuse une page sans loyer mensuel', () => {
    expect(
      parseDetail('<div class="de-biens-info"><div class="price">250 000 €</div></div>'),
    ).toBeNull();
  });
});

describe('guyHoquetScraper', () => {
  it('rend `empty` quand chaque commune affiche « Aucun résultat... »', async () => {
    const empty = read('annonces-cagnes-sur-mer-06800.html');
    const pages = Object.fromEntries(LIST_URLS.map((url) => [url, empty]));
    expect(await guyHoquetScraper.run(contextServing(pages))).toMatchObject({
      stopReason: 'empty',
      warnings: [],
    });
  });

  it('lit la fiche de l’annonce trouvée', async () => {
    const empty = read('annonces-cagnes-sur-mer-06800.html');
    const pages: Record<string, string> = Object.fromEntries(LIST_URLS.map((url) => [url, empty]));
    pages[LIST_URLS[0] ?? ''] = read('annonces-nice-06000.html');
    pages[URL_1898127] = read('fiche-1898127.html');
    const result = await guyHoquetScraper.run(contextServing(pages));
    expect(result.stopReason).toBe('completed');
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0]?.depositText).toBe('2700 €');
  });
});
