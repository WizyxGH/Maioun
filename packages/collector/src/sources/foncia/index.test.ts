/** Le passage Foncia : pagination et état des candidatures. Aucun accès réseau. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FetchResult, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { fonciaScraper } from './index.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/foncia');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

const PAGE_2 = 'https://fr.foncia.com/location/nice-06/appartement/page-2';
const OVERVIEW = 'fnc-api.prod.fonciatech.net/parcours-locataire/api/v1/properties/overview';

type Answer = string | Error;

interface Call {
  readonly url: string;
  readonly conditional: boolean | undefined;
}

/**
 * Contexte dont chaque URL répond ce qu'on lui dit. Les pages non prévues
 * rendent une page vide ; une `Error` est levée comme le ferait le client HTTP.
 */
function contexte(answers: (url: string) => Answer | undefined) {
  const calls: Call[] = [];
  const ok = (body: string): FetchResult => ({
    status: 200,
    body,
    headers: {},
    notModified: false,
  });
  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url, init) => {
      calls.push({ url, conditional: init?.conditional });
      const answer = answers(url) ?? '<html><body></body></html>';
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(ok(answer));
    },
    isKnown: () => true,
    knownRefs: new Set(),
    lastFullPassAt: null,
    detailMemory: {
      get: () => ({ draft: {}, fetchedAt: new Date().toISOString() }),
      save: () => Promise.resolve(),
    },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, calls };
}

/** Liste de deux pages, et une réponse d'API par référence. */
function site(overview: Record<string, Answer>) {
  return (url: string): Answer | undefined => {
    if (url === 'https://fr.foncia.com/location/nice-06000/appartement') {
      return read('liste-page1.html');
    }
    if (url === PAGE_2) return read('liste-page2.html');
    if (url.includes(OVERVIEW)) {
      const reference = new URL(url).searchParams.get('propertyId') ?? '';
      return overview[reference];
    }
    return undefined;
  };
}

const overviewCalls = (calls: readonly Call[]): Call[] =>
  calls.filter((call) => call.url.includes(OVERVIEW));

describe('fonciaScraper — pagination', () => {
  it('lit toutes les pages de la liste', async () => {
    const { ctx, calls } = contexte(site({}));
    const result = await fonciaScraper.run(ctx);

    expect(result.listings.map((l) => l.sourceRef)).toEqual([
      '900200001',
      '900200002',
      '900200003',
    ]);
    expect(calls.map((call) => call.url)).toContain(PAGE_2);
    expect(result.stopReason).toBe('completed');
  });
});

describe('fonciaScraper — candidatures', () => {
  it('pose l’état de chaque annonce et rend les louées', async () => {
    const { ctx, calls } = contexte(
      site({
        '900200001': read('overview-full.json'),
        '900200002': read('overview-open.json'),
        '900200003': read('overview-rented.json'),
      }),
    );
    const result = await fonciaScraper.run(ctx);

    const status = (ref: string) =>
      result.listings.find((l) => l.sourceRef === ref)?.extra?.['applicationStatus'];
    expect(status('900200001')).toBe('full');
    expect(status('900200002')).toBe('open');
    expect(status('900200003')).toBeUndefined();
    expect(result.rentedRefs).toEqual(['900200003']);

    const checks = overviewCalls(calls);
    // Le numéro d'agence de CHAQUE annonce, lu dans l'état de sa page.
    expect(checks[1]?.url).toContain('propertyId=900200002&agencyId=1864');
    // Un 304 ne dirait rien du compteur : jamais de requête conditionnelle.
    expect(checks.every((call) => call.conditional === false)).toBe(true);
  });

  it('un 429 arrête la série, et le reste du passage', async () => {
    const { ctx, calls } = contexte(
      site({
        '900200001': new Error('HTTP 429 reçu sur … — arrêt de la source et cooldown'),
        '900200002': read('overview-full.json'),
      }),
    );
    const result = await fonciaScraper.run(ctx);

    expect(overviewCalls(calls)).toHaveLength(1);
    expect(result.stopReason).toBe('rateLimited');
    expect(result.listings.some((l) => l.extra?.['applicationStatus'] !== undefined)).toBe(false);
  });

  it('une erreur serveur ne conclut rien pour cette annonce, la série continue', async () => {
    const { ctx, calls } = contexte(
      site({
        '900200001': new Error('HTTP 500 temporaire sur …'),
        '900200002': read('overview-full.json'),
        '900200003': 'pas du JSON',
      }),
    );
    const result = await fonciaScraper.run(ctx);

    expect(overviewCalls(calls)).toHaveLength(3);
    const status = (ref: string) =>
      result.listings.find((l) => l.sourceRef === ref)?.extra?.['applicationStatus'];
    expect(status('900200001')).toBeUndefined();
    expect(status('900200002')).toBe('full');
    expect(status('900200003')).toBeUndefined();
    expect(result.rentedRefs).toEqual([]);
    expect(result.stopReason).toBe('completed');
  });

  it('ne demande rien pour une annonce sans numéro d’agence', async () => {
    const { ctx, calls } = contexte((url) =>
      url.endsWith('/nice-06000/appartement') ? read('nice-page1.html') : undefined,
    );
    const result = await fonciaScraper.run(ctx);

    expect(result.listings).toHaveLength(3);
    expect(overviewCalls(calls)).toHaveLength(0);
  });
});
