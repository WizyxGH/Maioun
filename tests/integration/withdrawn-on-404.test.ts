/**
 * Retrait immédiat sur 404 : bout en bout, de la fiche absente à l'occurrence
 * éteinte.
 *
 * Une annonce partie restait affichée le temps de trois passages sans la revoir.
 * Quand la fiche répond 404 ou 410, la collecte n'a pas à attendre. Mais rien ne
 * doit s'éteindre sur un refus, un incident ou un inventaire lu à moitié : ces
 * cas sont ici aussi, car c'est eux qui décident si le mécanisme est sûr.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createRegistry,
  createRepository,
  createTestClock,
  laforetScraper,
  migrate,
  openDatabase,
  runPipeline,
  silentLogger,
  type Database,
  type Repository,
} from '@maioun/collector';
import { runListAndDetails } from '../../packages/collector/src/sources/shared/list-and-details.js';
import { MVP_CRITERIA, type RawListing, type Scraper } from '@maioun/shared';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(here, '../../database/migrations');
const LIST = 'https://agence.invalid/locations';
const REFS = ['a', 'b', 'c'] as const;
const fiche = (ref: string): string => `https://agence.invalid/fiche/${ref}`;

/** La liste porte déjà le loyer : la fiche n'ajoute que la description. */
const scraper: Scraper = {
  descriptor: {
    ...laforetScraper.descriptor,
    id: 'agence-essai',
    domain: 'agence.invalid',
    allowedPaths: ['/'],
  },
  run: (context) =>
    runListAndDetails(context, {
      sourceId: 'agence-essai',
      listUrls: [LIST],
      parseList: (): RawListing[] =>
        REFS.map((ref) => ({
          sourceRef: ref,
          sourceUrl: fiche(ref),
          title: `Appartement ${ref}`,
          priceText: '900 €',
          areaText: '40 m²',
          city: 'Nice',
        })),
      parseDetail: (html) => (html.includes('description') ? { description: html } : null),
      maxDetails: 5,
    }),
};

/**
 * Le site : la liste répond toujours, les fiches selon `fiches`. `null` fait
 * échouer la requête, un nombre rend ce code nu.
 */
function site(fiches: Record<string, number | string | null>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(typeof input === 'object' && 'url' in input ? input.url : input);
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\n', { status: 200 });
    if (url.startsWith(LIST)) return new Response('liste', { status: 200 });
    const ref = url.slice(url.lastIndexOf('/') + 1);
    const reponse = Object.hasOwn(fiches, ref) ? fiches[ref] : 'description entière';
    if (reponse === null) throw new Error('réseau injoignable');
    if (typeof reponse === 'number') return new Response('', { status: reponse });
    return new Response(reponse, { status: 200 });
  }) as typeof fetch;
}

describe('retrait immédiat quand la fiche répond 404', () => {
  let db: Database;
  let repository: Repository;

  const options = (fetchImpl: typeof fetch, nowMs: number) => ({
    registry: createRegistry([scraper]),
    repository,
    config: {
      criteria: MVP_CRITERIA,
      maxSourcesPerRun: 6,
      referencePricePerSqm: 20,
      missingRunsBeforePossiblyInactive: 2,
      missingRunsBeforeInactive: 3,
    },
    referencePoints: [],
    userAgent: 'MaiounBot/0.1 (test)',
    mode: 'live' as const,
    clock: createTestClock({ startMs: nowMs, random: 0 }),
    logger: silentLogger,
    fetchImpl,
    force: true,
  });

  const NOW = Date.parse('2026-09-16T08:00:00.000Z');

  /** Cycles de vie des trois annonces, par référence. */
  async function cycles(): Promise<Record<string, string>> {
    const rows = await db.execute(
      "SELECT source_ref, lifecycle FROM occurrences WHERE source_id = 'agence-essai'",
    );
    return Object.fromEntries(
      rows.rows.map((row) => [String(row['source_ref']), String(row['lifecycle'])]),
    );
  }

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
    // Premier passage : les fiches échouent, donc aucune mémoire n'est gardée et
    // le passage suivant ira les relire — c'est là que le retrait se joue.
    await runPipeline(options(site({ a: null, b: null, c: null }), NOW));
    expect(await cycles()).toEqual({ a: 'active', b: 'active', c: 'active' });
  });

  it('éteint dans la collecte même l’annonce dont la fiche a disparu', async () => {
    await runPipeline(options(site({ a: 404 }), NOW + 3_600_000));
    expect(await cycles()).toEqual({ a: 'inactive', b: 'active', c: 'active' });

    // Le vieillissement ne la ramènera pas au doute.
    const row = await db.execute(
      "SELECT missing_runs FROM occurrences WHERE source_id = 'agence-essai' AND source_ref = 'a'",
    );
    expect(Number(row.rows[0]?.['missing_runs'])).toBeGreaterThanOrEqual(3);
  });

  it('éteint aussi sur un 410', async () => {
    await runPipeline(options(site({ a: 410 }), NOW + 3_600_000));
    expect((await cycles())['a']).toBe('inactive');
  });

  it.each([403, 429, 500, 503])('n’éteint rien sur un %s', async (status) => {
    await runPipeline(options(site({ a: status }), NOW + 3_600_000));
    expect(await cycles()).toEqual({ a: 'active', b: 'active', c: 'active' });
  });

  it('n’éteint rien quand la fiche est injoignable', async () => {
    await runPipeline(options(site({ a: null }), NOW + 3_600_000));
    expect((await cycles())['a']).toBe('active');
  });

  it('n’éteint rien quand le site répond 404 sur tout : c’est lui qui a bougé', async () => {
    await runPipeline(options(site({ a: 404, b: 404, c: 404 }), NOW + 3_600_000));
    expect(await cycles()).toEqual({ a: 'active', b: 'active', c: 'active' });
  });
});
