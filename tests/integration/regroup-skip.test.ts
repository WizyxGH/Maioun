/**
 * LE REGROUPEMENT NE SE REFAIT PAS POUR RIEN.
 *
 * Il relit tout le corpus vivant puis toutes les fiches — environ dix mille
 * lignes — et tournait à chaque passage, quatre-vingt-seize fois par jour. Or
 * 276 des 338 fenêtres de quinze minutes du 19 au 22 septembre 2026 n'ont vu
 * naître aucune occurrence : le même calcul, sur le même corpus, pour le même
 * résultat. C'est le premier poste de lecture chez Turso.
 *
 * Deux garanties, et il faut les deux : SAUTER quand rien n'a bougé, et
 * REPASSER quand même après une demi-heure de calme — les scores vieillissent
 * avec l'horloge, et la fiche porte la date à laquelle on l'a vue.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
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
const PAGE = readFileSync(resolve(FIXTURES, 'nice-page1.html'), 'utf8');
const NOW = Date.parse('2026-08-14T12:00:00.000Z');
const QUART_HEURE = 15 * 60 * 1000;

const CONFIG = {
  criteria: MVP_CRITERIA,
  maxSourcesPerRun: 6,
  referencePricePerSqm: 20,
  missingRunsBeforePossiblyInactive: 2,
  missingRunsBeforeInactive: 6,
};

const servirLaMemePage = (async () => new Response(PAGE, { status: 200 })) as typeof fetch;

function options(repository: Repository, nowMs: number) {
  return {
    registry: createRegistry([laforetScraper]),
    repository,
    config: CONFIG,
    referencePoints: [],
    userAgent: 'MaiounBot/0.1 (test)',
    mode: 'live' as const,
    clock: createTestClock({ startMs: nowMs, random: 0 }),
    logger: silentLogger,
    fetchImpl: servirLaMemePage,
  };
}

/** La date du dernier regroupement ; `null` tant qu'il n'a jamais tourné. */
async function dernierRegroupement(db: Database): Promise<string | null> {
  const rows = await db.execute('SELECT last_at FROM regroup_state WHERE id = 1');
  const raw = rows.rows[0]?.['last_at'];
  return typeof raw === 'string' ? raw : null;
}

describe('le regroupement, quand rien n’a bougé', () => {
  let db: Database;
  let repository: Repository;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
  });

  it('tourne au premier passage, qui découvre tout', async () => {
    await runPipeline(options(repository, NOW));
    const at = await dernierRegroupement(db);
    expect(at).not.toBeNull();
    // L'horloge de test avance pendant le passage : on borne, on ne fige pas.
    expect(Date.parse(at as string)).toBeGreaterThanOrEqual(NOW);
  });

  it('se saute au passage suivant, la même page servie à l’identique', async () => {
    await runPipeline(options(repository, NOW));
    const premier = await dernierRegroupement(db);
    const rapport = await runPipeline(options(repository, NOW + QUART_HEURE));

    // Rien d'écrit : ni occurrence, ni fiche.
    expect(rapport.written.inserted + rapport.written.updated).toBe(0);
    // Et la date du regroupement n'a pas bougé : il n'a pas eu lieu.
    expect(await dernierRegroupement(db)).toBe(premier);
  });

  it('repasse quand même après une demi-heure de calme', async () => {
    await runPipeline(options(repository, NOW));
    const premier = await dernierRegroupement(db);
    await runPipeline(options(repository, NOW + QUART_HEURE));
    expect(await dernierRegroupement(db)).toBe(premier);

    await runPipeline(options(repository, NOW + 31 * 60 * 1000));
    const apres = await dernierRegroupement(db);
    expect(Date.parse(apres as string)).toBeGreaterThan(Date.parse(premier as string));
  });

  it('laisse les fiches en place pendant le saut', async () => {
    await runPipeline(options(repository, NOW));
    const avant = await db.execute('SELECT COUNT(*) AS n FROM listings');
    await runPipeline(options(repository, NOW + QUART_HEURE));
    const apres = await db.execute('SELECT COUNT(*) AS n FROM listings');
    expect(apres.rows[0]?.['n']).toBe(avant.rows[0]?.['n']);
  });
});
