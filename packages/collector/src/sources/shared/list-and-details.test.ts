import { describe, expect, it } from 'vitest';
import type { RawListing, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { runListAndDetails } from './list-and-details.js';

const LIST = 'https://agence.exemple/locations';

/** Une page d'essai : un corps, un `304`, un incident, ou un code HTTP nu. */
type Page = string | '304' | Error | number;

function context(pages: Record<string, Page>, known: readonly string[] = []) {
  const seen: string[] = [];
  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url) => {
      seen.push(url);
      const page = pages[url] ?? '';
      if (page instanceof Error) return Promise.reject(page);
      if (page === '304') {
        return Promise.resolve({ status: 304, body: '', headers: {}, notModified: true });
      }
      if (typeof page === 'number') {
        return Promise.resolve({ status: page, body: '', headers: {}, notModified: false });
      }
      return Promise.resolve({ status: 200, body: page, headers: {}, notModified: false });
    },
    isKnown: (ref) => known.includes(ref),
    knownRefs: new Set(known),
    lastFullPassAt: null,
    detailMemory: { get: () => null, save: () => Promise.resolve() },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, seen };
}

/** Liste : une référence par ligne ; fiche : « prix » ou vide. */
const options = {
  sourceId: 'exemple',
  listUrls: [LIST],
  parseList: (body: string): RawListing[] =>
    body
      .split('\n')
      .filter(Boolean)
      .map((ref) => ({ sourceRef: ref, sourceUrl: `https://agence.exemple/fiche/${ref}` })),
  parseDetail: (html: string) => (html === '' ? null : { priceText: html }),
  maxDetails: 5,
};

describe('runListAndDetails', () => {
  it('lit les fiches et ne rend que les annonces qui ont un loyer', async () => {
    const { ctx, seen } = context({
      [LIST]: 'a\nb',
      'https://agence.exemple/fiche/a': '900 €',
      'https://agence.exemple/fiche/b': '',
    });
    const result = await runListAndDetails(ctx, options);
    expect(result.listings.map((l) => [l.sourceRef, l.priceText])).toEqual([['a', '900 €']]);
    expect(seen).toHaveLength(3);
    expect(result.stopReason).toBe('completed');
  });

  it('confirme une annonce connue dont la fiche n’a rien rendu', async () => {
    const { ctx } = context({ [LIST]: 'a', 'https://agence.exemple/fiche/a': new Error('500') }, [
      'a',
    ]);
    const result = await runListAndDetails(ctx, options);
    expect(result.listings).toEqual([]);
    expect(result.confirmedRefs).toEqual(['a']);
  });

  it('s’arrête sur une liste inchangée ou refusée', async () => {
    expect((await runListAndDetails(context({ [LIST]: '304' }).ctx, options)).stopReason).toBe(
      'notModified',
    );
    const refused = context({ [LIST]: new Error('HTTP 429 sur la liste') });
    expect((await runListAndDetails(refused.ctx, options)).stopReason).toBe('rateLimited');
  });

  it('rend `empty` sur le seul message « aucun résultat » de la plateforme', async () => {
    const withMarker = {
      ...options,
      parseList: (body: string) => (body === 'AUCUN' ? [] : options.parseList(body)),
      isEmptyList: (body: string) => body === 'AUCUN',
    };
    const said = await runListAndDetails(context({ [LIST]: 'AUCUN' }).ctx, withMarker);
    expect(said).toMatchObject({ stopReason: 'empty', warnings: [] });

    // Page vide sans le message : gabarit peut-être cassé, pas d'aveu.
    const silent = await runListAndDetails(context({ [LIST]: '' }).ctx, withMarker);
    expect(silent.stopReason).toBe('completed');
    expect(silent.warnings).toHaveLength(1);

    // Une seconde liste inchangée pourrait encore porter des annonces.
    const OTHER = 'https://agence.exemple/autres';
    const partial = await runListAndDetails(context({ [LIST]: 'AUCUN', [OTHER]: '304' }).ctx, {
      ...withMarker,
      listUrls: [LIST, OTHER],
    });
    expect(partial.stopReason).toBe('completed');
  });

  it('lit les données de la fiche à une autre adresse quand la source le demande', async () => {
    const { ctx, seen } = context({
      [LIST]: 'a',
      'https://api.exemple/bien?ref=a': '750 €',
    });
    const result = await runListAndDetails(ctx, {
      ...options,
      detailUrl: (listing) => `https://api.exemple/bien?ref=${listing.sourceRef}`,
    });
    expect(seen).toEqual([LIST, 'https://api.exemple/bien?ref=a']);
    expect(result.listings[0]).toMatchObject({
      sourceUrl: 'https://agence.exemple/fiche/a',
      priceText: '750 €',
    });
  });

  it('éteint dès ce passage une annonce connue dont la fiche répond 404', async () => {
    const { ctx } = context(
      {
        [LIST]: 'a\nb\nc',
        'https://agence.exemple/fiche/a': 404,
        'https://agence.exemple/fiche/b': '800 €',
        'https://agence.exemple/fiche/c': '900 €',
      },
      ['a', 'b', 'c'],
    );
    const result = await runListAndDetails(ctx, options);
    expect(result.withdrawnRefs).toEqual(['a']);
    // Ni rendue, ni confirmée : la confirmation la remettrait en ligne.
    expect(result.listings.map((one) => one.sourceRef)).toEqual(['b', 'c']);
    expect(result.confirmedRefs).not.toContain('a');
  });

  it('ne retire rien quand une liste a échoué : l’inventaire est incomplet', async () => {
    const OTHER = 'https://agence.exemple/autres';
    const { ctx } = context(
      {
        [LIST]: 'a\nb',
        [OTHER]: new Error('HTTP 503 temporaire'),
        'https://agence.exemple/fiche/a': 404,
        'https://agence.exemple/fiche/b': '800 €',
      },
      ['a', 'b'],
    );
    const result = await runListAndDetails(ctx, { ...options, listUrls: [LIST, OTHER] });
    expect(result.withdrawnRefs).toEqual([]);
  });

  it.each([403, 500, 503])('ne retire rien sur un %s', async (status) => {
    const { ctx } = context(
      { [LIST]: 'a\nb', 'https://agence.exemple/fiche/a': new Error(`HTTP ${status}`) },
      ['a', 'b'],
    );
    const result = await runListAndDetails(ctx, options);
    expect(result.withdrawnRefs).toEqual([]);
  });
});
