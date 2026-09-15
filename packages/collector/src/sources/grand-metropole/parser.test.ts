import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';

// Liste (trois biens sur treize) et fiche réelles du 2026-09-15, allégées.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/grand-metropole');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
const FICHE_URL =
  'https://gdmetropole.com/admo-biens/chambre-meublee-colocation-etudiante-appartement-3p-meuble-renove-balcon-clim/';

describe('parseList (Grand Métropole)', () => {
  const html = read('locations.html');

  it('ne garde que la location disponible', () => {
    const listings = parseList(html);
    expect(listings.map((l) => l.sourceRef)).toEqual(['11856']);
    expect(listings[0]?.sourceUrl).toBe(FICHE_URL);
  });

  it('écarte un bureau même sans étiquette « Loué »', () => {
    const unrented = html.replace(
      /<span class="jet-listing-dynamic-terms__link">Loué<\/span>/g,
      '',
    );
    expect(parseList(unrented).map((l) => l.sourceRef)).toEqual(['10976', '11856']);
  });
});

describe('parseDetail (Grand Métropole)', () => {
  const html = read('fiche-colocation-saint-augustin.html');
  const draft = parseDetail(html);

  it('lit les champs, les montants « 1.400,00 € » et la galerie', () => {
    expect(draft?.priceText).toBe('700 €');
    expect(draft?.depositText).toBe('1400 €');
    expect(draft?.feesText).toBe('754 €');
    expect(draft?.areaText).toBe('58 m²');
    expect(draft?.roomsText).toBe('3 pièces 2 chambres');
    expect(draft?.cityText).toBe('NICE');
    expect(draft?.propertyTypeText).toBe('Appartement');
    expect(draft?.availableAtText).toBe('01/09/2026');
    expect(draft?.extra).toEqual({ reference: 'COLOCATION SAINT AUGUSTIN' });
    expect(draft?.imageUrls).toHaveLength(7);
    expect(draft?.description).toMatch(/^A LOUER – NICE- 2 CHAMBRES MEUBLEES/);
    expect(draft?.description).toMatch(/abonnements compris\)$/);
  });

  it('refuse une fiche louée', () => {
    expect(
      parseDetail(
        html.replace('statut-du-bien-location', 'statut-du-bien-location loue-vendu-loue'),
      ),
    ).toBeNull();
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      { sourceRef: '11856', sourceUrl: FICHE_URL, ...draft },
      { sourceId: 'grand-metropole', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(700);
    expect(normalized?.area).toBe(58);
    expect(normalized?.city).toBe('nice');
  });
});
