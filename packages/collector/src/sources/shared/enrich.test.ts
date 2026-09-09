/**
 * Tests de `enrichNewListings`, le complément des annonces par leur fiche.
 *
 * Aucun accès réseau : le `fetch` du contexte est injecté (§59).
 */

import { describe, expect, it } from 'vitest';
import type { RawListing, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { enrichNewListings } from './enrich.js';

const listing = (sourceRef: string): RawListing => ({
  sourceRef,
  sourceUrl: `https://exemple.invalid/fiche/${sourceRef}`,
  description: 'demi-phrase tronquée par la…',
});

interface ContextOptions {
  readonly known?: readonly string[];
  readonly mode?: 'live' | 'backfill';
  readonly body?: (url: string) => string;
  readonly fail?: (url: string) => string | null;
}

function context(options: ContextOptions = {}): { ctx: ScrapeContext; visited: string[] } {
  const known = new Set(options.known ?? []);
  const visited: string[] = [];

  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: options.mode ?? 'live',
    fetch: async (url) => {
      visited.push(url);
      const failure = options.fail?.(url) ?? null;
      if (failure !== null) throw new Error(failure);
      return await Promise.resolve({
        status: 200,
        body: options.body?.(url) ?? 'texte entier de la fiche',
        headers: {},
        notModified: false,
      });
    },
    isKnown: (sourceRef) => known.has(sourceRef),
    knownRefs: known,
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, visited };
}

const parseAll = (html: string): { description: string } => ({ description: html });

describe('enrichNewListings', () => {
  it('visite la fiche des annonces nouvelles et fusionne ce qu’elle apprend', async () => {
    const { ctx, visited } = context();
    const result = await enrichNewListings(ctx, [listing('a'), listing('b')], {
      max: 5,
      detailUrl: (one) => one.sourceUrl,
      parse: parseAll,
    });

    expect(visited).toHaveLength(2);
    expect(result.listings.map((one) => one.description)).toEqual([
      'texte entier de la fiche',
      'texte entier de la fiche',
    ]);
    expect(result.pagesFetched).toBe(2);
  });

  it('laisse les annonces déjà connues tranquilles en marche courante (§30)', async () => {
    const { ctx, visited } = context({ known: ['a'] });
    const result = await enrichNewListings(ctx, [listing('a'), listing('b')], {
      max: 5,
      detailUrl: (one) => one.sourceUrl,
      parse: parseAll,
    });

    expect(visited).toEqual(['https://exemple.invalid/fiche/b']);
    expect(result.listings[0]?.description).toBe('demi-phrase tronquée par la…');
  });

  /**
   * SANS CELA, LE STOCK EXISTANT RESTAIT TRONQUÉ À VIE : une annonce n'était
   * visitée qu'au jour de sa découverte, si bien que celles collectées avant
   * que la source ne visite les fiches n'avaient aucune chance de s'enrichir.
   */
  it('reprend les annonces connues en rattrapage (§8)', async () => {
    const { ctx, visited } = context({ known: ['a', 'b'], mode: 'backfill' });
    const result = await enrichNewListings(ctx, [listing('a'), listing('b')], {
      max: 5,
      detailUrl: (one) => one.sourceUrl,
      parse: parseAll,
    });

    expect(visited).toHaveLength(2);
    expect(result.listings[0]?.description).toBe('texte entier de la fiche');
  });

  it('ne dépasse jamais le nombre de fiches accordé', async () => {
    const { ctx, visited } = context();
    await enrichNewListings(ctx, [listing('a'), listing('b'), listing('c')], {
      max: 2,
      detailUrl: (one) => one.sourceUrl,
      parse: parseAll,
    });
    expect(visited).toHaveLength(2);
  });

  it('garde l’annonce intacte quand la fiche n’apprend rien (§17)', async () => {
    const { ctx } = context();
    const result = await enrichNewListings(ctx, [listing('a')], {
      max: 5,
      detailUrl: (one) => one.sourceUrl,
      parse: () => null,
    });
    expect(result.listings[0]?.description).toBe('demi-phrase tronquée par la…');
  });

  it('une fiche injoignable laisse l’annonce en place et prévient (§69)', async () => {
    const { ctx } = context({ fail: () => 'ECONNRESET' });
    const result = await enrichNewListings(ctx, [listing('a')], {
      max: 5,
      detailUrl: (one) => one.sourceUrl,
      parse: parseAll,
    });
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0]?.description).toBe('demi-phrase tronquée par la…');
    expect(result.warnings[0]).toContain('Fiche injoignable');
  });

  it('un 429 arrête la série sur-le-champ : la source en a assez (§10)', async () => {
    const { ctx, visited } = context({ fail: () => 'HTTP 429 Too Many Requests' });
    await enrichNewListings(ctx, [listing('a'), listing('b'), listing('c')], {
      max: 5,
      detailUrl: (one) => one.sourceUrl,
      parse: parseAll,
    });
    expect(visited).toHaveLength(1);
  });

  it('saute une annonce sans fiche exploitable', async () => {
    const { ctx, visited } = context();
    await enrichNewListings(ctx, [listing('a')], {
      max: 5,
      detailUrl: () => null,
      parse: parseAll,
    });
    expect(visited).toHaveLength(0);
  });

  it('conserve l’ordre donné par la source', async () => {
    const { ctx } = context();
    const result = await enrichNewListings(ctx, [listing('c'), listing('a'), listing('b')], {
      max: 5,
      detailUrl: (one) => one.sourceUrl,
      parse: parseAll,
    });
    expect(result.listings.map((one) => one.sourceRef)).toEqual(['c', 'a', 'b']);
  });
});
