/**
 * Le passage Figaro Immobilier : pagination, garde-fou du total annoncé, pages
 * inchangées et conformité au robots.txt. Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FetchResult, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { createRobotsGate } from '../../core/robots.js';
import { figaroImmoScraper } from './index.js';
import { listUrl } from './parser.js';

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../tests/fixtures/figaro-immo/${name}`, import.meta.url)),
    'utf8',
  );
const PAGE_1 = fixture('liste-page-1.html');
const LAST_PAGE = fixture('liste-derniere-page.html');

const ok = (body: string): FetchResult => ({ status: 200, body, headers: {}, notModified: false });
const NOT_MODIFIED: FetchResult = { status: 304, body: '', headers: {}, notModified: true };

/**
 * Une page de résultats minimale, encodée comme Nuxt : un tableau plat dont
 * chaque valeur est rangée à part et désignée par son indice.
 */
function page(ids: readonly string[], total: number, current: number, last: number): string {
  const flat: unknown[] = [];
  const put = (value: unknown): number => {
    const index = flat.push(null) - 1;
    if (Array.isArray(value)) flat[index] = value.map(put);
    else if (value !== null && typeof value === 'object') {
      flat[index] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, put(v)]));
    } else flat[index] = value;
    return index;
  };
  put({
    data: {
      classifiedsListResponse: {
        classifieds: ids.map((id) => ({
          id,
          transaction: 'location',
          type: 'appartement',
          price: 900,
        })),
        pagination: { currentPage: current, totalPage: last },
        total,
      },
    },
  });
  return `<script type="application/json" id="__NUXT_DATA__">${JSON.stringify(flat)}</script>`;
}

function contexte(
  respond: (url: string) => FetchResult | Error,
  memoire = new Map<string, readonly string[]>(),
) {
  const urls: string[] = [];
  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url) => {
      urls.push(url);
      const answer = respond(url);
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
    isKnown: () => false,
    knownRefs: new Set(),
    lastFullPassAt: null,
    detailMemory: { get: () => null, save: () => Promise.resolve() },
    pageRefs: {
      get: (url) => Promise.resolve(memoire.get(url) ?? null),
      set: (url, refs) => {
        memoire.set(url, refs);
        return Promise.resolve();
      },
    },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, urls, memoire };
}

describe('figaroImmoScraper', () => {
  it('lit chaque recherche jusqu’à sa dernière page, et aucune fiche', async () => {
    const { ctx, urls } = contexte((url) => {
      if (url === listUrl('appartement', 1)) return ok(PAGE_1);
      if (url === listUrl('appartement', 2)) return ok(LAST_PAGE);
      return ok(page([], 0, 1, 1));
    });
    const result = await figaroImmoScraper.run(ctx);

    expect(urls).toEqual([
      listUrl('appartement', 1),
      listUrl('appartement', 2),
      listUrl('maison', 1),
    ]);
    expect(result.listings).toHaveLength(8);
    expect(result.requestCount).toBe(3);
    // 8 annonces lues pour 360 annoncées : rien ne doit se retirer.
    expect(result.stopReason).toBe('incomplete');
  });

  it('termine quand le compte y est, doublons de pagination compris', async () => {
    const { ctx } = contexte((url) => {
      if (url === listUrl('appartement', 1)) return ok(page(['1', '2', '3'], 5, 1, 2));
      // Le tri a glissé : « 3 » revient en tête de la page 2.
      if (url === listUrl('appartement', 2)) return ok(page(['3', '4', '5'], 5, 2, 2));
      return ok(page(['9'], 1, 1, 1));
    });
    const result = await figaroImmoScraper.run(ctx);
    expect(result.listings.map((l) => l.sourceRef)).toEqual(['1', '2', '3', '4', '5', '9']);
    expect(result.stopReason).toBe('completed');
  });

  it('tolère le doublon que le site compte dans son total', async () => {
    const { ctx } = contexte((url) =>
      url === listUrl('appartement', 1)
        ? ok(page(['1', '1', '2'], 3, 1, 1))
        : ok(page(['9', '9'], 2, 1, 1)),
    );
    expect((await figaroImmoScraper.run(ctx)).stopReason).toBe('completed');
  });

  it('confirme les annonces d’une page inchangée déjà vue', async () => {
    const memoire = new Map<string, readonly string[]>([[listUrl('appartement', 1), ['1', '2']]]);
    const { ctx } = contexte((url) => {
      if (url === listUrl('appartement', 1)) return NOT_MODIFIED;
      if (url === listUrl('appartement', 2)) return ok(page(['3'], 3, 2, 2));
      return ok(page([], 0, 1, 1));
    }, memoire);
    const result = await figaroImmoScraper.run(ctx);
    expect(result.confirmedRefs).toEqual(['1', '2']);
    expect(result.listings.map((l) => l.sourceRef)).toEqual(['3']);
  });

  it('s’arrête sur un 429 en gardant ce qui est lu', async () => {
    const { ctx, urls } = contexte((url) =>
      url === listUrl('appartement', 1) ? ok(PAGE_1) : new Error('HTTP 429'),
    );
    const result = await figaroImmoScraper.run(ctx);
    expect(result.stopReason).toBe('rateLimited');
    expect(result.listings).toHaveLength(6);
    expect(urls).toHaveLength(2);
  });

  it('ne retire rien quand la page ne porte plus d’état lisible', async () => {
    const { ctx } = contexte(() => ok('<html>Maintenance</html>'));
    const result = await figaroImmoScraper.run(ctx);
    expect(result.stopReason).toBe('incomplete');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('robots.txt', () => {
  // Les règles qui comptent, relevées le 2026-09-15.
  const ROBOTS = [
    'User-agent: *',
    'Allow: /annonces/*?option=particulier$',
    'Disallow: /annonces/*?',
    'Allow: /annonces/*page=*',
    'Disallow: /annonces/*+7pieces*.html',
    'Disallow: /*?pagination=',
    'Disallow: /annonce/',
    'Disallow: /rest/',
    'Disallow: /*xhr',
    'Disallow: /s/',
  ].join('\n');
  const gate = createRobotsGate({
    userAgent: 'MaiounBot/0.1',
    fetchImpl: () => Promise.resolve(new Response(ROBOTS, { status: 200 })),
  });

  it('laisse passer toutes les pages lues', async () => {
    for (const search of ['appartement', 'maison'] as const) {
      for (const n of [1, 2, 12])
        await expect(gate.check(listUrl(search, n))).resolves.toBeUndefined();
    }
  });

  it('interdirait la pagination par ?pagination=', async () => {
    await expect(gate.check(`${listUrl('appartement', 1)}?pagination=2`)).rejects.toThrow(/robots/);
  });
});
