/**
 * La surveillance des sources, branchée sur une vraie base.
 *
 * Le module de décision est testé à part, sur des faits inventés. Ce qui se
 * vérifie ICI, et nulle part ailleurs : que les faits LUS EN BASE sont bien
 * ceux que la décision attend, et qu'un incident ne se signale qu'une fois même
 * si la collecte repasse toutes les demi-heures.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createRepository,
  migrate,
  openDatabase,
  reportSourceHealth,
  silentLogger,
  SOURCE_HEALTH_SETTING,
  type Database,
  type Repository,
} from '@maioun/collector';
import { makeContact, makeOccurrence } from '../helpers/factories.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../database/migrations');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-16T12:00:00.000Z');

/** Un passage de collecte tel que `recordRun` l'écrit. */
async function run(
  repository: Repository,
  sourceId: string,
  atMs: number,
  listingsNew: number,
  stopReason = 'completed',
): Promise<void> {
  await repository.recordRun({
    id: `${sourceId}-${String(atMs)}`,
    sourceId,
    startedAt: new Date(atMs).toISOString(),
    finishedAt: new Date(atMs).toISOString(),
    requestCount: 1,
    pagesFetched: 1,
    listingsFound: listingsNew,
    listingsNew,
    listingsUpdated: 0,
    duplicates: 0,
    errors: 0,
    stopReason: stopReason as never,
    warnings: [],
  });
}

describe('sourceObservations : ce que la surveillance lit en base', () => {
  let db: Database;
  let repository: Repository;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
  });

  it('rend les annonces neuves par journée, les dernières raisons d’arrêt et le stock', async () => {
    for (let offset = 9; offset >= 3; offset -= 1) {
      await run(repository, 'rentumo', NOW - offset * DAY, 40);
    }
    for (let offset = 2; offset >= 0; offset -= 1) {
      await run(repository, 'rentumo', NOW - offset * DAY, 0, 'knownTerritory');
    }
    await repository.upsertOccurrences(
      Array.from({ length: 12 }, (_, i) =>
        makeOccurrence({ id: `rentumo:${String(i)}`, sourceId: 'rentumo' }),
      ),
    );

    const [observation] = await repository.sourceObservations(
      new Date(NOW - 3 * DAY).toISOString(),
      3,
    );
    expect(observation?.sourceId).toBe('rentumo');
    expect(observation?.activeCount).toBe(12);
    expect(observation?.newByDay.get(new Date(NOW).toISOString().slice(0, 10))).toBe(0);
    expect(observation?.newByDay.get(new Date(NOW - 5 * DAY).toISOString().slice(0, 10))).toBe(40);
    // Les trois DERNIERS passages, du plus ancien au plus récent.
    expect(observation?.stopReasons).toEqual([
      'knownTerritory',
      'knownTerritory',
      'knownTerritory',
    ]);
  });

  it('compte le remplissage d’un champ avant et depuis la coupure', async () => {
    const old = new Date(NOW - 10 * DAY).toISOString();
    const fresh = new Date(NOW - 1 * DAY).toISOString();
    await repository.upsertOccurrences([
      ...Array.from({ length: 10 }, (_, i) =>
        makeOccurrence({
          id: `fnaim:vieux-${String(i)}`,
          sourceId: 'fnaim',
          firstSeenAt: old,
          contact: makeContact({ phone: '06 00 00 00 12' }),
        }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        makeOccurrence({
          id: `fnaim:neuf-${String(i)}`,
          sourceId: 'fnaim',
          firstSeenAt: fresh,
          contact: makeContact({ phone: null }),
        }),
      ),
    ]);

    const [observation] = await repository.sourceObservations(
      new Date(NOW - 3 * DAY).toISOString(),
      3,
    );
    const phone = observation?.fields.get('phone');
    expect(phone?.older).toEqual({ total: 10, filled: 10 });
    expect(phone?.recent).toEqual({ total: 6, filled: 0 });
  });
});

describe('une alerte par source et par incident, sur la vraie mémoire', () => {
  let db: Database;
  let repository: Repository;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
  });

  const degradee = {
    transitions: [
      {
        sourceId: 'marchal',
        from: 'healthy' as const,
        to: 'degraded' as const,
        listingsFound: 0,
        error: 'gabarit inconnu',
      },
    ],
    lifecycleSkips: [],
    logger: silentLogger,
    siteUrl: 'https://exemple.test',
    vapid: null,
    userId: 'moi',
  };

  it('signale une fois, puis se tait quand la collecte repasse', async () => {
    const first = await reportSourceHealth({ ...degradee, repository, nowMs: NOW });
    expect(first.map((one) => one.kind)).toEqual(['health']);

    // La collecte repasse une demi-heure plus tard : le symptôme est toujours là.
    const second = await reportSourceHealth({
      ...degradee,
      repository,
      nowMs: NOW + 30 * 60_000,
    });
    expect(second).toEqual([]);

    // Et la mémoire est bien rangée là où on croit.
    const stored = await repository.readSetting(SOURCE_HEALTH_SETTING);
    expect(JSON.parse(stored ?? '{}')).toHaveProperty('marchal|health');
  });

  it('ne dit rien du tout quand tout va bien', async () => {
    const alerts = await reportSourceHealth({
      ...degradee,
      transitions: [],
      repository,
      nowMs: NOW,
    });
    expect(alerts).toEqual([]);
  });

  it('ne fait pas échouer la collecte si la base refuse de répondre', async () => {
    db.close();
    await expect(reportSourceHealth({ ...degradee, repository, nowMs: NOW })).resolves.toEqual([]);
  });
});
