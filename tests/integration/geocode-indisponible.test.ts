/**
 * LE GÉOCODAGE NE DOIT PAS TUER LE PASSAGE.
 *
 * La BAN est un service PUBLIC, gratuit et souvent chargé. Le 2026-10-02, elle
 * ne répondait plus : le géocodeur renvoyait une exception, non isolée, et le
 * process sortait en code 1 — VINGT-CINQ RUNS CONSÉCUTIFS perdus, après la
 * collecte, le dédoublonnage et les 3 661 fiches déjà comptées. Sur la console,
 * la dernière ligne avant le crash était « 3 661 fiche(s) après dédoublonnage ».
 *
 * Sans coordonnées, une annonce reste hors de la carte : c'est regrettable.
 * C'est un enrichissement, pas le travail.
 *
 * Aucun accès réseau : `fetch` est simulé et répond par l'échec.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MVP_CRITERIA } from '@maioun/shared';
import {
  createGeocoder,
  createRegistry,
  createRepository,
  createTestClock,
  migrate,
  openDatabase,
  runPipeline,
  silentLogger,
  laforetScraper,
  type Database,
  type Repository,
} from '@maioun/collector';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(here, '../fixtures/laforet');
const MIGRATIONS = resolve(here, '../../database/migrations');
const fixture = (name: string): string => readFileSync(resolve(FIXTURES, name), 'utf8');

const NOW = Date.parse('2026-08-14T12:00:00.000Z');

const CONFIG = {
  criteria: MVP_CRITERIA,
  maxSourcesPerRun: 6,
  referencePricePerSqm: 20,
  missingRunsBeforePossiblyInactive: 2,
  missingRunsBeforeInactive: 6,
};

/** Un réseau qui ne répond à PERSONNE — la BAN saturée, en pire. */
const reseauMort = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;

/** Un cache conforme : la BAN morte ne doit rien y laisser non plus. */
const cacheVide = {
  get: () => Promise.resolve(null),
  set: () => Promise.resolve(),
};

/**
 * Un cache dont l'ÉCRITURE échoue — Turso qui expire, base saturée.
 *
 * C'EST LE CAS RÉEL DU 2026-10-02, et il ne ressemblait pas à une panne
 * réseau : Turso répond en HTTP, donc son erreur ressemblerait mot pour mot à un
 * `TypeError: fetch failed`. Vingt-cinq runs consécutifs sont tombés là, sur la
 * ligne de jalon « NNNN fiche(s) après dédoublonnage » — c'est-à-dire après la
 * collecte et avant le géocodage affiché, ce qui désigne l'écriture du cache et
 * rien d'autre.
 */
const cacheQuiRefuse = {
  get: () => Promise.resolve(null),
  set: () => Promise.reject(new TypeError('fetch failed')),
};

async function setup(): Promise<{ db: Database; repository: Repository }> {
  const db = openDatabase({ url: ':memory:' });
  await migrate(db, MIGRATIONS, silentLogger);
  return { db, repository: createRepository(db) };
}

describe('la BAN ne répond plus', () => {
  it('le géocodeur ne lève pas', async () => {
    const geocoder = createGeocoder({
      cache: cacheVide,
      nowMs: NOW,
      userAgent: 'MaiounBot/0.1 (test)',
      fetchImpl: reseauMort,
    });

    // Ni exception, ni point inventé : une adresse non trouvée reste absente.
    await expect(geocoder.geocode('52 Rue Smollett 06300 Nice')).resolves.toBeNull();
  });

  it('rend le résultat même quand l’écriture du cache échoue', async () => {
    const BAN_JOUE = (async () =>
      new Response(
        JSON.stringify({
          features: [
            {
              geometry: { coordinates: [7.266, 43.703] },
              properties: {
                type: 'housenumber',
                score: 0.9,
                name: 'Rue Smollett',
                housenumber: '52',
                city: 'Nice',
                citycode: '06088',
                postcode: '06300',
                label: '52 Rue Smollett 06300 Nice',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;

    const geocoder = createGeocoder({
      cache: cacheQuiRefuse,
      nowMs: NOW,
      userAgent: 'MaiounBot/0.1 (test)',
      fetchImpl: BAN_JOUE,
    });

    // La BAN répond, la base non. Le point est rendu : seule sa mémorisation
    // est perdue, donc une requête de plus au prochain run.
    const point = await geocoder.geocode('52 Rue Smollett 06300 Nice');
    expect(point?.latitude).toBeCloseTo(43.703);
  });

  it('le passage s’écrit quand même', async () => {
    const { db, repository } = await setup();
    const rapport = await runPipeline({
      registry: createRegistry([laforetScraper]),
      repository,
      config: CONFIG,
      referencePoints: [],
      userAgent: 'MaiounBot/0.1 (test)',
      mode: 'live' as const,
      clock: createTestClock({ startMs: NOW, random: 0 }),
      logger: silentLogger,
      // Le site des annonces répond, la BAN non : c'est ce qu'un service public
      // saturé fait — et c'est exactement le 2026-10-02.
      fetchImpl: (async (entree: RequestInfo | URL) => {
        const url = String(entree);
        if (url.includes('api-adresse.data.gouv.fr')) throw new TypeError('fetch failed');
        return new Response(fixture('nice-page1.html'), { status: 200 });
      }) as typeof fetch,
    });

    // Le run aboutit : les fiches sont là, sans coordonnées.
    expect(rapport.listingsCollected).toBeGreaterThan(0);
    const lignes = await db.execute('SELECT COUNT(*) AS n FROM listings');
    expect(Number(lignes.rows[0]?.['n'])).toBeGreaterThan(0);
  });
});

describe('les étapes après l’écriture ne l’annulent pas', () => {
  it('un `retireDepartedListings` en erreur laisse les fiches en place', async () => {
    const { db, repository } = await setup();
    const casse: Repository = {
      ...repository,
      retireDepartedListings: () => Promise.reject(new Error('SQLITE_BUSY')),
    };

    const rapport = await runPipeline({
      registry: createRegistry([laforetScraper]),
      repository: casse,
      config: CONFIG,
      referencePoints: [],
      userAgent: 'MaiounBot/0.1 (test)',
      mode: 'live' as const,
      clock: createTestClock({ startMs: NOW, random: 0 }),
      logger: silentLogger,
      fetchImpl: (async () =>
        new Response(fixture('nice-page1.html'), { status: 200 })) as typeof fetch,
    });

    expect(rapport.written.inserted).toBeGreaterThan(0);
    const lignes = await db.execute('SELECT COUNT(*) AS n FROM listings');
    expect(Number(lignes.rows[0]?.['n'])).toBeGreaterThan(0);
  });

  it('un classement par compte en erreur laisse les fiches en place', async () => {
    const { db, repository } = await setup();
    const casse: Repository = {
      ...repository,
      saveUserScores: () => Promise.reject(new Error('SQLITE_BUSY')),
    };

    await runPipeline({
      registry: createRegistry([laforetScraper]),
      repository: casse,
      config: CONFIG,
      referencePoints: [],
      userAgent: 'MaiounBot/0.1 (test)',
      mode: 'live' as const,
      clock: createTestClock({ startMs: NOW, random: 0 }),
      logger: silentLogger,
      fetchImpl: (async () =>
        new Response(fixture('nice-page1.html'), { status: 200 })) as typeof fetch,
    });

    const lignes = await db.execute('SELECT COUNT(*) AS n FROM listings');
    expect(Number(lignes.rows[0]?.['n'])).toBeGreaterThan(0);
  });
});
