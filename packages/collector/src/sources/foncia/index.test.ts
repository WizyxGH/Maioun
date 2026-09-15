/** Le passage Foncia : pagination, retraits et état des candidatures. Aucun accès réseau. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FetchResult, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { fonciaScraper } from './index.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/foncia');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

const PAGE_2 = 'https://fr.foncia.com/location/nice-06/appartement/page-2';
const fiche = (reference: string): string =>
  `https://fr.foncia.com/location/nice-06/appartement/${reference}.htm`;

/** Un corps de page, une réponse d'un autre statut, ou une erreur levée. */
type Answer = string | { status: number; body: string } | Error;

interface Call {
  readonly url: string;
  readonly conditional: boolean | undefined;
}

interface Options {
  readonly knownRefs?: readonly string[];
}

/**
 * Contexte dont chaque URL répond ce qu'on lui dit. Les pages non prévues
 * rendent une page vide ; une `Error` est levée comme le ferait le client HTTP.
 */
function contexte(answers: (url: string) => Answer | undefined, options: Options = {}) {
  const calls: Call[] = [];
  const known = new Set(options.knownRefs ?? []);
  const reply = (answer: Answer): Promise<FetchResult> => {
    if (answer instanceof Error) return Promise.reject(answer);
    const { status, body } = typeof answer === 'string' ? { status: 200, body: answer } : answer;
    return Promise.resolve({ status, body, headers: {}, notModified: false });
  };
  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url, init) => {
      calls.push({ url, conditional: init?.conditional });
      return reply(answers(url) ?? '<html><body></body></html>');
    },
    isKnown: (reference) => known.has(reference),
    knownRefs: known,
    lastFullPassAt: null,
    detailMemory: { get: () => null, save: () => Promise.resolve() },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, calls };
}

/** Liste de deux pages, et une réponse par fiche. */
function site(fiches: Record<string, Answer>) {
  return (url: string): Answer | undefined => {
    if (url === 'https://fr.foncia.com/location/nice-06000/appartement') {
      return read('liste-page1.html');
    }
    if (url === PAGE_2) return read('liste-page2.html');
    const reference = /\/(\d+)\.htm$/.exec(url)?.[1];
    return reference === undefined ? undefined : fiches[reference];
  };
}

const ficheCalls = (calls: readonly Call[]): Call[] =>
  calls.filter((call) => call.url.endsWith('.htm'));

const statusOf = (listings: readonly { sourceRef: string; extra?: object }[], ref: string) =>
  (listings.find((l) => l.sourceRef === ref)?.extra as Record<string, unknown> | undefined)?.[
    'applicationStatus'
  ];

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
  const troisFiches = {
    '900200001': read('fiche-candidature-complet.html'),
    '900200002': read('fiche-candidature-ouverte.html'),
    '900200003': read('fiche-candidature-loue.html'),
  };

  it('pose l’état de chaque annonce et rend les louées', async () => {
    const { ctx, calls } = contexte(site(troisFiches));
    const result = await fonciaScraper.run(ctx);

    expect(statusOf(result.listings, '900200001')).toBe('full');
    expect(statusOf(result.listings, '900200002')).toBe('open');
    expect(statusOf(result.listings, '900200003')).toBeUndefined();
    expect(result.rentedRefs).toEqual(['900200003']);

    // Un 304 laisserait l'état inconnu : jamais de requête conditionnelle.
    expect(ficheCalls(calls).every((call) => call.conditional === false)).toBe(true);
    // Rien ne part plus vers l'API de candidature.
    expect(calls.some((call) => call.url.includes('fonciatech'))).toBe(false);
  });

  it('une annonce nouvelle ne coûte qu’UNE lecture de fiche, description comprise', async () => {
    const { ctx, calls } = contexte(site(troisFiches));
    const result = await fonciaScraper.run(ctx);

    for (const reference of ['900200001', '900200002', '900200003']) {
      expect(ficheCalls(calls).filter((call) => call.url === fiche(reference))).toHaveLength(1);
    }
    const ouverte = result.listings.find((l) => l.sourceRef === '900200002');
    expect(ouverte?.description).toBe(
      'Appartement fictif candidature ouverte\ndeux pièces lumineuses',
    );
  });

  it('un 429 arrête la série, et le reste du passage', async () => {
    const { ctx, calls } = contexte(
      site({
        '900200001': new Error('HTTP 429 reçu sur … — arrêt de la source et cooldown'),
        '900200002': read('fiche-candidature-complet.html'),
      }),
    );
    const result = await fonciaScraper.run(ctx);

    expect(ficheCalls(calls)).toHaveLength(1);
    expect(result.stopReason).toBe('rateLimited');
    expect(result.listings.some((l) => l.extra?.['applicationStatus'] !== undefined)).toBe(false);
  });

  it('un refus arrête la série sans conclure', async () => {
    const { ctx, calls } = contexte(
      site({
        '900200001': new Error('HTTP 403 sur … — accès refusé, la source est marquée bloquée'),
        '900200002': read('fiche-candidature-complet.html'),
      }),
    );
    const result = await fonciaScraper.run(ctx);

    expect(
      calls.filter((call) => call.url.endsWith('.htm') && call.conditional === false),
    ).toHaveLength(1);
    expect(result.listings.some((l) => l.extra?.['applicationStatus'] !== undefined)).toBe(false);
  });

  it('une erreur ou une fiche sans bouton ne conclut rien, la série continue', async () => {
    const { ctx, calls } = contexte(
      site({
        '900200001': new Error('HTTP 500 temporaire sur …'),
        '900200002': read('fiche-candidature-complet.html'),
        '900200003': read('fiche-active.html'),
      }),
    );
    const result = await fonciaScraper.run(ctx);

    const checks = ficheCalls(calls).filter((call) => call.conditional === false);
    expect(checks).toHaveLength(3);
    expect(statusOf(result.listings, '900200001')).toBeUndefined();
    expect(statusOf(result.listings, '900200002')).toBe('full');
    expect(statusOf(result.listings, '900200003')).toBeUndefined();
    expect(result.rentedRefs).toEqual([]);
    expect(result.stopReason).toBe('completed');
  });
});

describe('fonciaScraper — annonces disparues', () => {
  it('une fiche en 410 est retirée ; une fiche muette ne l’est pas', async () => {
    const { ctx } = contexte(
      site({
        '331707068': { status: 410, body: '<html><body>Erreur 404</body></html>' },
        '331707069': '<html><body></body></html>',
      }),
      { knownRefs: ['331707068', '331707069'] },
    );
    const result = await fonciaScraper.run(ctx);

    expect(result.rentedRefs).toEqual(['331707068']);
  });
});
