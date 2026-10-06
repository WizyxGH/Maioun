import { describe, expect, it } from 'vitest';
import type { RawListing, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { runListAndDetails } from './list-and-details.js';
import { SHORT_COVERAGE_WARNING } from './announced-total.js';

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

/**
 * LE SITE SAIT CE QU'IL PUBLIE, ET IL LE DIT.
 *
 * Un gabarit qui ne suivait aucune pagination a laissé vingt annonces d'une
 * agence hors de la base pendant des semaines, sans qu'aucun relevé ne s'en
 * aperçoive. Comparer le total annoncé au nombre lu est la seule mesure qui
 * rende ce trou visible avant que l'utilisateur ne tombe dessus ailleurs.
 */
describe('couverture annoncée par le site', () => {
  const page = (compteur: string, refs: readonly string[]): string =>
    `<html><body><p>${compteur}</p>${refs.map((r) => `<a href="/fiche/${r}">x</a>`).join('')}</body></html>`;

  const parRefs = {
    ...options,
    parseList: (body: string): RawListing[] =>
      [...body.matchAll(/href="\/fiche\/([a-z0-9]+)"/g)].map((m) => ({
        sourceRef: m[1] ?? '',
        sourceUrl: `https://agence.exemple/fiche/${m[1] ?? ''}`,
      })),
  };

  it('signale le manque quand le site annonce plus que ce qu’on a lu', async () => {
    const { ctx } = context({
      [LIST]: page('9 annonces trouvées', ['a', 'b']),
      'https://agence.exemple/fiche/a': '900 €',
      'https://agence.exemple/fiche/b': '800 €',
    });
    const result = await runListAndDetails(ctx, parRefs);
    expect(result.warnings.some((one) => one.startsWith(SHORT_COVERAGE_WARNING))).toBe(true);
    // Ce qui a été lu reste bon : le passage n'est pas dénaturé pour autant.
    expect(result.listings).toHaveLength(2);
    expect(result.stopReason).toBe('completed');
  });

  it('ne signale rien quand le compte y est', async () => {
    const { ctx } = context({
      [LIST]: page('2 annonces trouvées', ['a', 'b']),
      'https://agence.exemple/fiche/a': '900 €',
      'https://agence.exemple/fiche/b': '800 €',
    });
    const result = await runListAndDetails(ctx, parRefs);
    expect(result.warnings.some((one) => one.startsWith(SHORT_COVERAGE_WARNING))).toBe(false);
  });

  it('ne signale rien quand le site n’annonce aucun total', async () => {
    const { ctx } = context({
      [LIST]: page('Nos locations', ['a']),
      'https://agence.exemple/fiche/a': '900 €',
    });
    const result = await runListAndDetails(ctx, parRefs);
    expect(result.warnings.some((one) => one.startsWith(SHORT_COVERAGE_WARNING))).toBe(false);
  });

  /**
   * CHAQUE PAGE D'UN SITE PAGINÉ ANNONCE LE TOTAL DE LA RECHERCHE, pas le sien.
   * On retient donc le plus grand total annoncé, et on le compare à ce que
   * TOUTES les listes ont rendu ensemble.
   */
  it('compare le plus grand total annoncé à l’ensemble des listes', async () => {
    const PAGE2 = 'https://agence.exemple/locations/2';
    const { ctx } = context({
      [LIST]: page('3 annonces trouvées', ['a', 'b']),
      [PAGE2]: page('3 annonces trouvées', ['c']),
      'https://agence.exemple/fiche/a': '900 €',
      'https://agence.exemple/fiche/b': '800 €',
      'https://agence.exemple/fiche/c': '700 €',
    });
    const result = await runListAndDetails(ctx, { ...parRefs, listUrls: [LIST, PAGE2] });
    expect(result.warnings.some((one) => one.startsWith(SHORT_COVERAGE_WARNING))).toBe(false);
  });

  it('une source peut lire son compteur elle-même', async () => {
    const { ctx } = context({
      [LIST]: page('catalogue', ['a']),
      'https://agence.exemple/fiche/a': '900 €',
    });
    const result = await runListAndDetails(ctx, { ...parRefs, announcedTotal: () => 4 });
    expect(result.warnings.some((one) => one.startsWith(SHORT_COVERAGE_WARNING))).toBe(true);
  });

  /**
   * UNE LISTE PAGINÉE SE LIT EN ENTIER. Repimmo range ses quatre-vingt-neuf
   * locations niçoises sur neuf pages ; n'en lire qu'une ferait passer les
   * quatre-vingts autres pour retirées.
   */
  describe('liste paginée', () => {
    const page = (n: number): string => `${LIST}?page=${n}`;
    const paginee = {
      ...options,
      // La page publie un lien vers la suivante, sauf la dernière.
      parseList: (body: string) => options.parseList(body.replace(/^>.*$/m, '')),
      nextPage: (body: string) => /^>(.*)$/m.exec(body)?.[1] ?? null,
    };

    it('suit les pages que le site publie, jusqu’à la dernière', async () => {
      const { ctx, seen } = context({
        [LIST]: `a\n>${page(2)}`,
        [page(2)]: `b\n>${page(3)}`,
        [page(3)]: 'c',
      });
      const result = await runListAndDetails(ctx, { ...paginee, maxDetails: 0 });
      expect(seen.slice(0, 3)).toEqual([LIST, page(2), page(3)]);
      expect(result.listings).toEqual([]);
      expect(result.stopReason).toBe('completed');
    });

    it('ne revalide pas les pages : un 304 sur la première ne dit rien des suivantes', async () => {
      const inits: unknown[] = [];
      const { ctx } = context({ [LIST]: 'a' });
      const fetch = ctx.fetch;
      await runListAndDetails(
        {
          ...ctx,
          fetch: (url, init) => {
            inits.push(init);
            return fetch(url, init);
          },
        },
        { ...paginee, maxDetails: 0 },
      );
      expect(inits[0]).toEqual({ conditional: false });
    });

    it('ne boucle pas sur une page qui renvoie à elle-même, et respecte le plafond', async () => {
      const boucle = context({ [LIST]: `a\n>${LIST}` });
      await runListAndDetails(boucle.ctx, { ...paginee, maxDetails: 0 });
      expect(boucle.seen).toEqual([LIST]);

      const sansFin = context(
        Object.fromEntries(
          Array.from({ length: 10 }, (_, n) => [
            n === 0 ? LIST : page(n + 1),
            `r${n}\n>${page(n + 2)}`,
          ]),
        ),
      );
      await runListAndDetails(sansFin.ctx, { ...paginee, maxDetails: 0, maxListPages: 4 });
      expect(sansFin.seen).toHaveLength(4);
    });

    it('s’arrête à une page vide, même si elle renvoie plus loin', async () => {
      const { ctx, seen } = context({ [LIST]: `a\n>${page(2)}`, [page(2)]: `>${page(3)}` });
      await runListAndDetails(ctx, { ...paginee, maxDetails: 0 });
      expect(seen).toEqual([LIST, page(2)]);
    });
  });
});
