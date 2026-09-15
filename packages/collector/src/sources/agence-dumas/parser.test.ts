import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MVP_CRITERIA, type ScrapeContext } from '@maioun/shared';
import { normalizeListing } from '../../normalization/normalize.js';
import { agenceDumasScraper } from './index.js';
import { isEmptyList, LIST_URL, parseDetail, parseList } from './parser.js';

// Pages réelles du 2026-09-15, allégées : liste des locations annuelles, une
// recherche sans résultat et une fiche à Villefranche-sur-Mer.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/agence-dumas');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

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

describe('parseList (Agence Dumas)', () => {
  const listings = parseList(read('locations-annuelles.html'));

  it('lit les six cartes avec identifiant, ville et loyer mensuel', () => {
    expect(listings).toHaveLength(6);
    expect(listings).toContainEqual(
      expect.objectContaining({
        sourceRef: '1521084',
        sourceUrl:
          'https://www.agencedumas.fr/p/appartement-2-pieces-vide-a-lannee-villefranche-sur-mer/',
        title: 'Appartement 2 pièces vide à l’année – Villefranche-sur-Mer',
        priceText: '1 850 € / mois',
        areaText: '55.72 m²',
        cityText: 'Villefranche sur mer',
      }),
    );
  });

  it('laisse le titre absent quand la carte n’en a pas', () => {
    const card = listings.find((listing) => listing.sourceRef === '1521194');
    expect(card?.title).toBeUndefined();
    expect(card?.cityText).toBe('Beaulieu sur mer');
  });

  it('ne rend pas vide une liste pleine, ni une page sans conteneur', () => {
    expect(isEmptyList(read('locations-annuelles.html'))).toBe(false);
    expect(isEmptyList(read('recherche-vide.html'))).toBe(true);
    expect(isEmptyList('<html><body></body></html>')).toBe(false);
    expect(isEmptyList('<div id="post-list"><div class="autre"></div></div>')).toBe(false);
  });
});

describe('parseDetail (Agence Dumas)', () => {
  const draft = parseDetail(read('fiche-villefranche.html'));

  it('lit loyer, montants de la description, détails et photos', () => {
    expect(draft?.priceText).toBe('1 850 € / mois');
    expect(draft?.chargesText).toBe('100 €');
    expect(draft?.depositText).toBe('1 850 €');
    expect(draft?.feesText).toBe('724,36 €');
    expect(draft?.areaText).toBe('55.72 m²');
    expect(draft?.roomsText).toBe('2 pièces');
    expect(draft?.cityText).toBe('Villefranche sur mer');
    expect(draft?.availableAtText).toBe('2 octobre 2026');
    expect(draft?.extra).toMatchObject({ reference: '85796680', dpe: 'A', ges: 'A' });
    expect(draft?.description).toMatch(/^Votre agence Dumas vous propose/);
    expect(draft?.imageUrls).toHaveLength(3);
  });

  it('sans titre, nomme le bien par l’accroche ; lit « Disponibilité : »', () => {
    const untitled = parseDetail(
      read('fiche-villefranche.html')
        .replace(/<div class="title">[^<]*<\/div>/, '<div class="title"></div>')
        .replace(
          'Appartement disponible à partir du 2 octobre 2026.',
          'Disponibilité : 16 septembre 2026',
        ),
    );
    expect(untitled?.title).toBeUndefined();
    expect(untitled?.propertyTypeText).toMatch(/^Votre agence Dumas vous propose/);
    expect(untitled?.availableAtText).toBe('16 septembre 2026');
  });

  it('refuse un tarif qui n’est pas mensuel', () => {
    const weekly = read('fiche-villefranche.html').replace('</span> / Mois', '</span> par semaine');
    expect(parseDetail(weekly)).toBeNull();
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      { sourceRef: '1521084', sourceUrl: 'https://www.agencedumas.fr/p/x/', ...draft },
      { sourceId: 'agence-dumas', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1850);
    expect(normalized?.deposit).toBe(1850);
    expect(normalized?.area).toBe(55.72);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.city).toBe('villefranche sur mer');
  });
});

describe('agenceDumasScraper', () => {
  it('rend `empty` sur un conteneur de résultats sans carte', async () => {
    const result = await agenceDumasScraper.run(
      context({ [LIST_URL]: read('recherche-vide.html') }),
    );
    expect(result).toMatchObject({ stopReason: 'empty', warnings: [] });
  });

  it('garde l’avertissement sur une page sans conteneur', async () => {
    const result = await agenceDumasScraper.run(context({ [LIST_URL]: '<html></html>' }));
    expect(result.stopReason).toBe('completed');
    expect(result.warnings).toHaveLength(1);
  });
});
