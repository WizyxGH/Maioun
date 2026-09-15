import { describe, expect, it } from 'vitest';
import type { ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { makeApimoListScraper } from './list-scraper.js';

const LIST = 'https://agence.invalid/fr/locations';

function context(pages: Record<string, string>) {
  const seen: string[] = [];
  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url) => {
      seen.push(url);
      return Promise.resolve({
        status: 200,
        body: pages[url] ?? '',
        headers: {},
        notModified: false,
      });
    },
    isKnown: () => false,
    knownRefs: new Set(),
    lastFullPassAt: null,
    detailMemory: { get: () => null, save: () => Promise.resolve() },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, seen };
}

const scraper = makeApimoListScraper({
  id: 'apimo-liste-test',
  name: 'Agence Test',
  domain: 'agence.invalid',
  listUrls: [LIST],
});

describe('makeApimoListScraper', () => {
  it('autorise le chemin de la liste configurée, quel qu’il soit', () => {
    const louer = makeApimoListScraper({
      id: 'apimo-louer',
      name: 'Agence Test',
      domain: 'agence.invalid',
      listUrls: ['https://agence.invalid/fr/louer', 'https://agence.invalid/fr/louer?page=2'],
    });
    expect(louer.descriptor.allowedPaths).toEqual(['/fr/louer*', '/fr/propri*']);
    expect(scraper.descriptor.allowedPaths).toEqual(['/fr/locations*', '/fr/propri*']);
  });

  it('ne signale rien quand la liste dit elle-même n’avoir aucun bien', async () => {
    const { ctx } = context({
      // Relevé sur norait-immobilier.fr/fr/location le 2026-09-15.
      [LIST]:
        '<div class="module module-listing"><div class="message no-results"><p>Aucun produit ne correspond à ce jour aux critères de votre recherche.</p></div><ul class="_list listing"></ul><nav class="pager" data-appear-top-offset="0" ><ul></ul></nav></div>',
    });
    const result = await scraper.run(ctx);
    expect(result.listings).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.stopReason).toBe('empty');
  });

  it('signale une liste vide sans ce message : la structure a changé', async () => {
    const { ctx } = context({ [LIST]: '<ul class="listing"></ul>' });
    const result = await scraper.run(ctx);
    expect(result.warnings.join(' ')).toMatch(/Aucune fiche/);
    expect(result.stopReason).toBe('completed');
  });

  it('ne visite pas les locaux commerciaux désignés par l’URL', async () => {
    const { ctx, seen } = context({
      [LIST]: '<a href="/fr/propriete/location+bureau+nice+plateau+87256603">Bureau</a>',
    });
    await scraper.run(ctx);
    expect(seen).toEqual([LIST]);
  });
});
