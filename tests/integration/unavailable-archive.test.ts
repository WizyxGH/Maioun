/**
 * Une annonce que la source dit louée ou retirée est archivée d'office, pour
 * tous les comptes et sans écriture personnelle : hors liste, hors favoris,
 * visible dans la vue des archivées avec sa raison. Le doute ne l'est pas.
 */

import { readFileSync } from 'node:fs';
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
  scoreListing,
  silentLogger,
  type Database,
  type Repository,
} from '@maioun/collector';
import { route } from '../../packages/collector/src/server/routes.js';
import { MVP_CRITERIA, type Scraper, type ScoredListing } from '@maioun/shared';
import { makeAggregated, makeOccurrence } from '../helpers/factories.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(here, '../../database/migrations');
const BASE = 'https://exemple.invalid';

function scored(id: string): ScoredListing {
  return scoreListing(
    makeAggregated({ id, occurrences: [makeOccurrence({ id, sourceId: 'orpi' })] }),
    { criteria: MVP_CRITERIA, nowMs: Date.now(), referencePricePerSqm: 20, referencePoints: [] },
  );
}

interface Item {
  readonly id: string;
  readonly archived: boolean;
  readonly archiveReason: string | null;
}

async function list(db: Database, userId: string, search: string): Promise<Map<string, Item>> {
  const url = new URL(`${BASE}/api/listings${search}`);
  const segments = url.pathname.split('/').filter((part) => part !== '');
  const response = await route(db, new Request(url), url, segments, {}, userId);
  expect(response.status).toBe(200);
  const body = JSON.parse(await response.text()) as { listings: Item[] };
  return new Map(body.listings.map((one) => [one.id, one]));
}

describe('archivage d’office des annonces plus disponibles', () => {
  let db: Database;
  const ids = ['orpi:en-ligne', 'orpi:en-doute', 'orpi:retiree', 'orpi:louee'];

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    const repository = createRepository(db);
    await repository.upsertOccurrences(ids.map((id) => makeOccurrence({ id, sourceId: 'orpi' })));
    await repository.saveListings(ids.map(scored));
    await db.batch(
      [
        { sql: "INSERT INTO users (id, created_at) VALUES ('alice', datetime('now'))", args: [] },
        { sql: "INSERT INTO users (id, created_at) VALUES ('bob', datetime('now'))", args: [] },
      ],
      'write',
    );
    for (const userId of ['alice', 'bob']) {
      await repository.saveUserScores(userId, ids.map(scored));
    }
    await db.batch(
      [
        {
          sql: "UPDATE listings SET lifecycle = 'possiblyInactive' WHERE id = 'orpi:en-doute'",
          args: [],
        },
        { sql: "UPDATE listings SET lifecycle = 'inactive' WHERE id = 'orpi:retiree'", args: [] },
        { sql: "UPDATE listings SET rented = 1 WHERE id = 'orpi:louee'", args: [] },
      ],
      'write',
    );
    // Alice les avait toutes en favori.
    for (const id of ids) {
      const url = new URL(`${BASE}/api/listings/${id}`);
      await route(
        db,
        new Request(url, { method: 'PATCH', body: JSON.stringify({ favorite: true }) }),
        url,
        url.pathname.split('/').filter((part) => part !== ''),
        {},
        'alice',
      );
    }
  });

  it('les sort de la liste et des favoris, mais garde le doute', async () => {
    for (const search of ['?limit=500', '?all=true', '?favorite=true']) {
      const vue = await list(db, 'alice', search);
      expect([...vue.keys()].sort(), search).toEqual(['orpi:en-doute', 'orpi:en-ligne']);
      expect(vue.get('orpi:en-doute')?.archived).toBe(false);
    }
  });

  it('les montre dans la vue des archivées, avec leur raison, pour chaque compte', async () => {
    for (const userId of ['alice', 'bob']) {
      const vue = await list(db, userId, '?archived=true&limit=500');
      expect(vue.size).toBe(4);
      expect(vue.get('orpi:retiree')).toMatchObject({ archived: true, archiveReason: 'offline' });
      expect(vue.get('orpi:louee')).toMatchObject({ archived: true, archiveReason: 'rented' });
      expect(vue.get('orpi:en-ligne')).toMatchObject({ archived: false, archiveReason: null });
    }
    // Rien d'écrit pour Bob : l'archivage se déduit, il ne se pose pas.
    const bob = await db.execute(
      "SELECT COUNT(*) AS n FROM listing_user_state WHERE user_id = 'bob'",
    );
    expect(Number(bob.rows[0]?.['n'])).toBe(0);
  });
});

describe('retrait dit par la source, dans le même passage', () => {
  let db: Database;
  let repository: Repository;
  const fixture = readFileSync(resolve(here, '../fixtures/laforet/nice-page1.html'), 'utf8');
  const fetchImpl = (async () => new Response(fixture, { status: 200 })) as typeof fetch;

  const options = (scrapers: readonly Scraper[], nowMs: number) => ({
    registry: createRegistry(scrapers),
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
  });

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
  });

  it('éteint l’annonce sans attendre les absences, même encore listée', async () => {
    const now = Date.parse('2026-08-14T12:00:00.000Z');
    await runPipeline(options([laforetScraper], now));
    const first = await db.execute(
      "SELECT source_ref, group_id FROM occurrences WHERE source_id = 'laforet' LIMIT 1",
    );
    const ref = String(first.rows[0]?.['source_ref']);
    const groupId = String(first.rows[0]?.['group_id']);

    const retirant: Scraper = {
      descriptor: laforetScraper.descriptor,
      run: async (context) => ({ ...(await laforetScraper.run(context)), withdrawnRefs: [ref] }),
    };
    await runPipeline(options([retirant], now + 3_600_000));

    const occurrence = await db.execute({
      sql: "SELECT lifecycle, missing_runs FROM occurrences WHERE source_id = 'laforet' AND source_ref = ?",
      args: [ref],
    });
    expect(occurrence.rows[0]?.['lifecycle']).toBe('inactive');
    // Le vieillissement ne la ramène pas au doute.
    expect(Number(occurrence.rows[0]?.['missing_runs'])).toBeGreaterThanOrEqual(3);
    const listing = await db.execute({
      sql: 'SELECT lifecycle FROM listings WHERE id = ?',
      args: [groupId],
    });
    expect(listing.rows[0]?.['lifecycle']).toBe('inactive');
    const others = await db.execute({
      sql: "SELECT COUNT(*) AS n FROM occurrences WHERE source_id = 'laforet' AND lifecycle = 'inactive' AND source_ref != ?",
      args: [ref],
    });
    expect(Number(others.rows[0]?.['n'])).toBe(0);
  });
});
