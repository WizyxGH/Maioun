/**
 * CE QUI DOIT ÊTRE ÉCRIT, ET CE QUI NE DOIT PAS EMPORTER LE RUN.
 *
 * La phase d'écriture n'était pas isolée : elle s'exécute dans la tâche que
 * `runGrouped` fait tourner en parallèle, et `mapLimited` est un `Promise.all`.
 * Une écriture qui lève emportait donc le passage ENTIER, avec les annonces
 * déjà collectées des deux cent autres sources — le pire endroit possible pour
 * perdre une nuit de travail.
 *
 * Ces deux tests utilisent une vraie base SQLite en mémoire et un `fetch`
 * simulé : aucun accès réseau, aucun accès à Turso.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Scraper } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import {
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

const serveNominal = (async () =>
  new Response(fixture('nice-page1.html'), { status: 200 })) as typeof fetch;

/**
 * Un dépôt dont UNE méthode échoue, pour éprouver l'isolation.
 *
 * L'erreur est INJECTÉE, pas attendue de l'original : celui-ci, sur une base en
 * mémoire, ne lève jamais. Une première version ne faisait que relayer sa
 * promesse — donc jamais rien ne cassait, et les trois tests passaient aussi
 * bien sans le correctif. Un test qui passe pour la mauvaise raison ne prouve
 * rien.
 */
function repositoryQuiRefuse(
  repository: Repository,
  methode: 'saveSourceState' | 'recordRun' | 'knownRefs',
): Repository {
  return {
    ...repository,
    [methode]: () => Promise.reject(new Error(`Turso a répondu 500 sur ${methode}`)),
  } as Repository;
}

async function setup(): Promise<{ db: Database; repository: Repository }> {
  const db = openDatabase({ url: ':memory:' });
  await migrate(db, MIGRATIONS, silentLogger);
  return { db, repository: createRepository(db) };
}

function options(repository: Repository, scrapers: readonly Scraper[] = [laforetScraper]) {
  return {
    registry: createRegistry(scrapers),
    repository,
    config: CONFIG,
    referencePoints: [],
    userAgent: 'MaiounBot/0.1 (test)',
    mode: 'live' as const,
    clock: createTestClock({ startMs: NOW, random: 0 }),
    logger: silentLogger,
    fetchImpl: serveNominal,
  };
}

describe('une écriture qui échoue n’emporte pas le passage', () => {
  it('survit à un saveSourceState en erreur', async () => {
    const { db, repository } = await setup();
    const rapport = await runPipeline(options(repositoryQuiRefuse(repository, 'saveSourceState')));

    // Le run va au bout : les annonces sont bel et bien écrites.
    expect(rapport.listingsCollected).toBeGreaterThan(0);
    const lignes = await db.execute('SELECT COUNT(*) AS n FROM listings');
    expect(Number(lignes.rows[0]?.['n'])).toBeGreaterThan(0);
  });

  it('survit à un recordRun en erreur', async () => {
    const { db, repository } = await setup();
    const rapport = await runPipeline(options(repositoryQuiRefuse(repository, 'recordRun')));

    expect(rapport.listingsCollected).toBeGreaterThan(0);
    const lignes = await db.execute('SELECT COUNT(*) AS n FROM listings');
    expect(Number(lignes.rows[0]?.['n'])).toBeGreaterThan(0);
  });

  it('survit à un knownRefs en erreur', async () => {
    const { db, repository } = await setup();
    const rapport = await runPipeline(options(repositoryQuiRefuse(repository, 'knownRefs')));

    expect(rapport.listingsCollected).toBeGreaterThan(0);
    const lignes = await db.execute('SELECT COUNT(*) AS n FROM listings');
    expect(Number(lignes.rows[0]?.['n'])).toBeGreaterThan(0);
  });
});

describe('un passage raté s’écrit quand même', () => {
  /** Une source qui lève : le chemin d'échec de `runSource`. */
  const sourceQuiEchoue: Scraper = {
    descriptor: {
      ...laforetScraper.descriptor,
      id: 'source-cassee',
      name: 'Source cassée',
      domain: 'cassee.invalid',
    },
    run: () => Promise.reject(new Error('HTTP 500 sur la page de liste')),
  };

  it('laisse une ligne, avec son motif, là où il n’y en avait aucune', async () => {
    const { db, repository } = await setup();
    // Le registre ne garde que six sources : on n'en prend que deux.
    await runPipeline(options(repository, [sourceQuiEchoue, laforetScraper]));

    const lignes = await db.execute(
      "SELECT source_id, errors, stop_reason, warnings FROM collection_runs WHERE source_id = 'source-cassee'",
    );

    // AVANT, cette source n'écrivait RIEN : `recordRun` était sous
    // `if (result !== null)`, et `result` est `null` sur tous les chemins
    // d'échec. La table censée dire ce qui avait échoué ne le pouvait pas —
    // 282 lignes et 282 zéros sur le miroir, y compris la seule bloquée.
    expect(lignes.rows.length).toBe(1);
    expect(Number(lignes.rows[0]?.['errors'])).toBe(1);
    expect(String(lignes.rows[0]?.['stop_reason'])).toBe('degraded');
    expect(String(lignes.rows[0]?.['warnings'])).toContain('HTTP 500');
  });

  it('n’empêche pas la source voisine d’être collectée', async () => {
    const { db, repository } = await setup();
    const rapport = await runPipeline(options(repository, [sourceQuiEchoue, laforetScraper]));

    expect(rapport.sourcesRun).toEqual(['source-cassee', 'laforet']);
    const lignes = await db.execute('SELECT COUNT(*) AS n FROM listings');
    expect(Number(lignes.rows[0]?.['n'])).toBeGreaterThan(0);
  });
});
