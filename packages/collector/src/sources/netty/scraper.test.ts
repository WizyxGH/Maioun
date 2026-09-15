import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DetailMemoryEntry, RawListing, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { sunImmobiliaScraper } from '../sun-immobilia/index.js';
import { makeNettyDescriptor, makeNettyScraper } from './scraper.js';

const BASE = {
  id: 'netty-test',
  name: 'Agence Test',
  domain: 'exemple.fr',
  sitemapUrl: 'https://www.exemple.fr/sitemap.xml',
  citySlugs: ['nice'],
};

describe('makeNettyDescriptor', () => {
  it('transmet les coordonnées de l’agence au descripteur', () => {
    const agencyContact = {
      phone: '04 00 00 00 00', // secret-scan-ignore
      address: { street: '1 rue de Test', postalCode: '06000', city: 'Nice' },
    };
    expect(makeNettyDescriptor({ ...BASE, agencyContact }).agencyContact).toEqual(agencyContact);
  });

  it('n’ajoute pas de clé vide quand l’agence n’en donne pas', () => {
    expect('agencyContact' in makeNettyDescriptor(BASE)).toBe(false);
  });
});

const COMMERCE = 'https://www.exemple.fr/location/local-commercial-nice-06000,LA99';
const VACANCES = 'https://www.exemple.fr/location/appartement-t2-nice-06000,LA98';
const urlset = (...locs: string[]): string =>
  `<?xml version="1.0"?><urlset>${locs.map((loc) => `<url><loc>${loc}</loc></url>`).join('')}</urlset>`;

/** Fiche Netty réduite à son JSON-LD, titrée en location saisonnière. */
const SEASONAL_PAGE = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@type': 'Product',
  name: 'Location saisonnière - T2 vue mer',
  offers: { price: 700, itemOffered: { address: { addressLocality: 'Nice' } } },
})}</script></head><body></body></html>`;

function context(
  pages: Record<string, string | Error>,
  memoire: Map<string, DetailMemoryEntry> = new Map(),
) {
  const visited: string[] = [];
  const saved: { sourceRef: string; draft: Partial<RawListing> }[] = [];
  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url) => {
      visited.push(url);
      const page = pages[url] ?? '<html></html>';
      if (page instanceof Error) return Promise.reject(page);
      return Promise.resolve({ status: 200, body: page, headers: {}, notModified: false });
    },
    isKnown: () => false,
    knownRefs: new Set(),
    lastFullPassAt: null,
    detailMemory: {
      get: (ref) => memoire.get(ref) ?? null,
      save: (entries) => {
        saved.push(...entries);
        return Promise.resolve();
      },
    },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, visited, saved };
}

const hier = (): string => new Date(Date.now() - 86_400_000).toISOString();

describe('makeNettyScraper — fiche écartée', () => {
  it('mémorise le local commercial et ne le relit pas de la semaine', async () => {
    const scraper = makeNettyScraper(BASE);
    const premier = context({ [BASE.sitemapUrl]: urlset(COMMERCE) });
    await scraper.run(premier.ctx);
    expect(premier.visited).toEqual([BASE.sitemapUrl, COMMERCE]);
    expect(premier.saved).toEqual([
      { sourceRef: 'LA99', draft: { extra: { excluded: 'commercial' } } },
    ]);

    const memoire = new Map([['LA99', { draft: {}, fetchedAt: hier() }]]);
    const second = context({ [BASE.sitemapUrl]: urlset(COMMERCE) }, memoire);
    await scraper.run(second.ctx);
    expect(second.visited).toEqual([BASE.sitemapUrl]);
  });
});

describe('makeNettyScraper — aucune location à l’année', () => {
  const scraper = makeNettyScraper(BASE);

  it('rend `empty` quand chaque fiche visée est écartée par règle, lue ou mémorisée', async () => {
    const lu = context({
      [BASE.sitemapUrl]: urlset(COMMERCE, VACANCES),
      [VACANCES]: SEASONAL_PAGE,
    });
    expect((await scraper.run(lu.ctx)).stopReason).toBe('empty');
    expect(lu.saved.map((entry) => entry.draft)).toEqual([
      { extra: { excluded: 'commercial' } },
      { extra: { excluded: 'seasonal' } },
    ]);

    // Passage suivant : rien à relire, et la liste reste reconnue vide.
    const memoire = new Map(
      lu.saved.map((entry) => [entry.sourceRef, { ...entry, fetchedAt: hier() }]),
    );
    const suivant = context({ [BASE.sitemapUrl]: urlset(COMMERCE, VACANCES) }, memoire);
    expect((await scraper.run(suivant.ctx)).stopReason).toBe('empty');
    expect(suivant.visited).toEqual([BASE.sitemapUrl]);
  });

  it('garde le doute sur une fiche illisible, en échec ou d’une mémoire muette', async () => {
    const illisible = context({ [BASE.sitemapUrl]: urlset(VACANCES) });
    expect((await scraper.run(illisible.ctx)).stopReason).toBe('completed');
    expect(illisible.saved).toEqual([{ sourceRef: 'LA98', draft: {} }]);

    const panne = context({
      [BASE.sitemapUrl]: urlset(COMMERCE, VACANCES),
      [VACANCES]: new Error('HTTP 500'),
    });
    expect((await scraper.run(panne.ctx)).stopReason).toBe('completed');

    // Écartée jadis sans motif connu (fiche illisible) : rien ne prouve un saisonnier.
    const memoire = new Map([['LA98', { draft: {}, fetchedAt: hier() }]]);
    const muette = context({ [BASE.sitemapUrl]: urlset(VACANCES) }, memoire);
    expect((await scraper.run(muette.ctx)).stopReason).toBe('completed');
  });

  it('Sun Immobilia : sitemap relevé, un seul local commercial à Cagnes', async () => {
    const FIXTURE = join(import.meta.dirname, '../../../../../tests/fixtures/sun-immobilia');
    const sitemap = readFileSync(join(FIXTURE, 'sitemap.xml'), 'utf8');
    const run = context({ 'https://www.sunimmobilia.fr/sitemap.xml': sitemap });
    const result = await sunImmobiliaScraper.run(run.ctx);
    expect(result).toMatchObject({ stopReason: 'empty', listings: [] });
    expect(run.visited).toHaveLength(2);
  });
});
