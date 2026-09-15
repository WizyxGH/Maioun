import { describe, expect, it } from 'vitest';
import type { DetailMemoryEntry, RawListing, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
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

describe('makeNettyScraper — fiche écartée', () => {
  const COMMERCE = 'https://www.exemple.fr/location/local-commercial-nice-06000,LA99';
  const SITEMAP = `<?xml version="1.0"?><urlset><url><loc>${COMMERCE}</loc></url></urlset>`;

  function context(memoire: Map<string, DetailMemoryEntry>) {
    const visited: string[] = [];
    const saved: { sourceRef: string; draft: Partial<RawListing> }[] = [];
    const ctx: ScrapeContext = {
      criteria: MVP_CRITERIA,
      mode: 'live',
      fetch: (url) => {
        visited.push(url);
        const body = url === BASE.sitemapUrl ? SITEMAP : '<html></html>';
        return Promise.resolve({ status: 200, body, headers: {}, notModified: false });
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

  it('mémorise le local commercial et ne le relit pas de la semaine', async () => {
    const scraper = makeNettyScraper(BASE);
    const premier = context(new Map());
    await scraper.run(premier.ctx);
    expect(premier.visited).toEqual([BASE.sitemapUrl, COMMERCE]);
    expect(premier.saved).toEqual([{ sourceRef: 'LA99', draft: {} }]);

    const hier = new Date(Date.now() - 86_400_000).toISOString();
    const second = context(new Map([['LA99', { draft: {}, fetchedAt: hier }]]));
    await scraper.run(second.ctx);
    expect(second.visited).toEqual([BASE.sitemapUrl]);
  });
});
