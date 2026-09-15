import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MVP_CRITERIA, type ScrapeContext } from '@maioun/shared';
import { normalizeListing } from '../../normalization/normalize.js';
import { rivieraSudImmobilierScraper } from './index.js';
import { listingsOf, parseListPage } from './parser.js';

// Liste des locations du 2026-09-15, allégée : flux RSC réduit aux biens.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/riviera-sud-immobilier');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
const ORIGIN = 'https://www.rsi-immo.com';
const LIST = `${ORIGIN}/biens-immobiliers/tous/location`;

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

describe('Riviera Sud Immobilier (IWS, flux RSC)', () => {
  const html = read('location.html');

  it('lit les biens et la pagination du flux', () => {
    const page = parseListPage(html);
    expect(page?.estates).toHaveLength(3);
    expect(page).toMatchObject({ total: 3, page: 1, limit: 10 });
    expect(page?.types.get(2)).toBe('studio-apartment');
  });

  it('rend chaque location avec son lien, son loyer CC et ses faits', () => {
    const page = parseListPage(html);
    if (page === null) throw new Error('flux illisible');
    const listings = listingsOf(html, page, ORIGIN, 'Riviera Sud Immobilier');
    expect(listings.map((l) => l.sourceRef)).toEqual(['726945', '726834', '715401']);
    const studio = listings[0];
    expect(studio).toMatchObject({
      sourceUrl: `${ORIGIN}/fr/estate/provence-alpes-cote-dazur/alpes-maritimes/nice-06300/location/appartement/appartement-t1-studio/1397-726945-1074376`,
      priceText: '680 € CC / mois',
      chargesText: '60 €',
      feesText: '204,5 €',
      areaText: '20 m²',
      roomsText: '1 pièce',
      propertyTypeText: 'Appartement T1 & Studio',
      furnishedText: 'meublé',
      addressText: '5 Rue Chabrier',
      cityText: 'Nice',
      postalCodeText: '06300',
    });
    expect(studio?.extra?.['dpe']).toBe('D');
    expect(studio?.imageUrls?.[0]).toBe(`${ORIGIN}/api/v2/estate-pictures/1397/726945/1.webp`);

    const normalized = normalizeListing(studio!, { sourceId: 'riviera-sud-immobilier', nowMs: 0 });
    expect(normalized?.price).toBe(680);
    expect(normalized?.charges).toBe(60);
    expect(normalized?.furnished).toBe(true);
    expect(normalized?.city).toBe('nice');
    expect(listings[2]?.propertyTypeText).toBe('Garage / Parking');
  });

  it('rend `empty` quand la plateforme annonce zéro bien', async () => {
    const result = await rivieraSudImmobilierScraper.run(
      context({ [LIST]: read('location-vide.html') }),
    );
    expect(result).toMatchObject({ stopReason: 'empty', listings: [], warnings: [] });
  });

  it('collecte la page sans avertissement, et signale un flux disparu', async () => {
    const full = await rivieraSudImmobilierScraper.run(context({ [LIST]: html }));
    expect(full).toMatchObject({ stopReason: 'completed', requestCount: 1, warnings: [] });
    expect(full.listings).toHaveLength(3);
    const broken = await rivieraSudImmobilierScraper.run(context({ [LIST]: '<html></html>' }));
    expect(broken.stopReason).toBe('completed');
    expect(broken.warnings.join(' ')).toMatch(/Aucun bien lisible/);
  });
});
