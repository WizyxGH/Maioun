import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MVP_CRITERIA, type ScrapeContext } from '@maioun/shared';
import { IMMO_RIVIERA_TRANSACTIONS, immoRivieraTransactionsScraper } from './index.js';
import { isEmptyList, listUrl, parseDetail, parseList, placeOf, referenceOf } from './parser.js';

// Pages réelles du 2026-09-15, allégées : recherche de location vide, ventes du même gabarit.
const FIXTURES = join(
  import.meta.dirname,
  '../../../../../tests/fixtures/immo-riviera-transactions',
);
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
const SITE = IMMO_RIVIERA_TRANSACTIONS;

function context(pages: Record<string, string>): ScrapeContext {
  return {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url) =>
      Promise.resolve({ status: 200, body: pages[url] ?? '', headers: {}, notModified: false }),
    isKnown: () => false,
    knownRefs: new Set(),
    lastFullPassAt: null,
    detailMemory: { get: () => null, save: () => Promise.resolve() },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
}

describe('Immo Riviera Transactions (Apimo free7)', () => {
  it('lit référence, commune et quartier', () => {
    expect(referenceOf('/fr/search/vente-appartement-2-pieces-nice-06200-4400841')).toBe('4400841');
    expect(referenceOf('/fr/vente/vente-villa-7-pieces-nice-valrose-06100')).toBe(
      'vente-villa-7-pieces-nice-valrose-06100',
    );
    expect(placeOf('Location Appartement - Nice Carras - Ferber')).toEqual({
      type: 'Appartement',
      city: 'Nice',
      district: 'Carras - Ferber',
    });
    expect(placeOf('Location Studio - La Trinité')).toEqual({ type: 'Studio', city: 'La Trinité' });
  });

  it('rend `empty` sur la recherche de location sans carte', async () => {
    const html = read('location-vide.html');
    expect(parseList(html, SITE)).toEqual([]);
    expect(isEmptyList(html)).toBe(true);
    const result = await immoRivieraTransactionsScraper.run(context({ [listUrl(SITE)]: html }));
    expect(result).toMatchObject({ stopReason: 'empty', warnings: [] });
  });

  it('ne prend pas une page sans liste pour une recherche vide', () => {
    expect(isEmptyList('<body class="estate-index"><p>Erreur</p></body>')).toBe(false);
  });

  it('ne garde que les cartes de location', () => {
    const sales = read('liste-vente.html');
    expect(parseList(sales, SITE)).toEqual([]);
    expect(isEmptyList(sales)).toBe(false);
    const rentals = parseList(sales.replaceAll('nature_1', 'nature_2'), SITE);
    expect(rentals).toHaveLength(3);
    expect(rentals[1]).toMatchObject({
      sourceRef: '4401771',
      sourceUrl:
        'http://www.immoriviera.fr/fr/vente/vente-villa-6-pieces-nice-corniche-fleurie-06200-4401771',
      cityText: 'Nice',
      postalCodeText: '06200',
      roomsText: '6 pièces',
      areaText: '200 m²',
      propertyTypeText: 'Villa',
    });
  });

  it('lit la fiche une fois la transaction en location', () => {
    const url =
      'http://www.immoriviera.fr/fr/search/location-appartement-2-pieces-nice-carras-ferber-06200-4402900';
    const sale = read('fiche-vente.html');
    const stub = { sourceRef: '4402900', sourceUrl: url };
    expect(parseDetail(sale, stub, SITE)).toBeNull();
    const html = sale
      .replace('<article class="nature_1">', '<article class="nature_2">')
      .replaceAll('132 900 €', '750 € / Mois')
      .replace(
        '<li>Honoraires à charge vendeur</li>',
        '<li>Honoraires locataire : 400 €</li><li>Dépôt de garantie : 750 €</li>',
      )
      .replace(
        '/fr/diagnostic/4402900/2/7',
        '/fr/diagnostic/4402900/1/150"><img src="/fr/diagnostic/4402900/2/7',
      );
    const draft = parseDetail(html, stub, SITE);
    expect(draft).toMatchObject({
      priceText: '750 € / Mois',
      areaText: '29 m²',
      roomsText: '2 pièces',
      feesText: '400 €',
      depositText: '750 €',
      cityText: 'Nice',
      postalCodeText: '06200',
      propertyTypeText: 'Appartement',
      availableAtText: 'Libre',
      agencyName: 'Immo Riviera Transactions',
    });
    expect(draft?.description).toMatch(/^Petit 2 pièces/);
    expect(draft?.extra).toMatchObject({
      reference: '87288922',
      quartier: 'Carras - Ferber',
      dpe: 'C',
    });
    expect(draft?.imageUrls).toHaveLength(8);
  });
});
