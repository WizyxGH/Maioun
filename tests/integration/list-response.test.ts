/**
 * La liste servie par ASSEMBLAGE de textes préparés à l'écriture.
 *
 * Le Worker analysait puis réémettait chaque fiche à chaque chargement : 2,5 Mo
 * et jusqu'à 94 ms de processeur, pour un palier gratuit de dix. Il recopie
 * désormais la version allégée rangée par la collecte.
 *
 * CE QUE CES TESTS GARDENT : la réponse relue vaut, fiche pour fiche, ce que
 * rendait l'ancienne requête passée par `rowToListing` — y compris quand une
 * ligne a été réécrite sans ses colonnes préparées, et après la reprise de
 * l'existant par la migration.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createRepository,
  migrate,
  openDatabase,
  scoreListing,
  silentLogger,
  splitStatements,
  type Database,
} from '@maioun/collector';
import { route, rowToListing } from '../../packages/collector/src/server/routes.js';
import { ANONYMOUS_USER, MVP_CRITERIA, type ScoredListing } from '@maioun/shared';
import { makeAggregated, makeContact, makeOccurrence } from '../helpers/factories.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../database/migrations');
const BASE = 'https://exemple.invalid';

/**
 * La requête de liste d'avant l'assemblage, recopiée : la référence. Ses champs
 * personnels ne viennent que des tables du lecteur — `listings.*` en tête les
 * lisait sur la fiche commune, et servait à tous l'état du compte principal.
 */
const avant = (anonymous: boolean): string => `SELECT listings.id AS id,
  listings.lifecycle AS lifecycle,
  listings.first_seen_at AS first_seen_at,
  listings.last_seen_at AS last_seen_at,
  listings.rented AS rented,
  ${
    anonymous
      ? `(listings.lifecycle != 'inactive'
          AND listings.property_type NOT IN ('parking', 'commercial')
          AND listings.city IN ('nice'))`
      : 'COALESCE(sc.matches_criteria, 0)'
  } AS user_matches_criteria,
  COALESCE(sc.action_priority, 0) AS user_action_priority,
  sc.scores AS user_scores,
  sc.distances AS user_distances,
  COALESCE(us.viewed, 0) AS user_viewed,
  COALESCE(us.archived, 0) AS user_archived,
  COALESCE(us.favorite, 0) AS user_favorite,
  COALESCE(us.tracking, 'new') AS user_tracking,
  us.notified_at AS user_notified_at,
  us.gone_notified_at AS gone_notified_at,
  us.reminded_at AS reminded_at,
  json_remove(listings.payload,
    '$.description',
    '$.scores.match.reasons',
    '$.scores.opportunity.reasons',
    '$.scores.visitProbability.reasons',
    '$.scores.risk.reasons') AS payload_light
FROM listings
LEFT JOIN listing_user_state AS us ON us.listing_id = listings.id AND us.user_id = ?
LEFT JOIN listing_user_score AS sc ON sc.listing_id = listings.id AND sc.user_id = ?
WHERE rented = 0`;

function scored(
  id: string,
  index: number,
  withPoints: boolean,
  maxPrice = MVP_CRITERIA.maxPrice,
): ScoredListing {
  const listing = {
    ...makeAggregated({
      id,
      price: 600 + index * 40,
      area: 20 + index * 3,
      description: `Description longue numéro ${index}, « guillemets » et \\ barre.`,
      contact: makeContact(),
      latitude: 43.7 + index / 1000,
      longitude: 7.26,
      occurrences: [makeOccurrence({ id, sourceId: 'orpi' })],
    }),
    imageUrls: [
      `https://photos.example.invalid/${index}/a.jpg`,
      'https://photos.example.invalid/b.jpg',
    ],
  };
  return scoreListing(listing, {
    criteria: { ...MVP_CRITERIA, maxPrice },
    nowMs: Date.now(),
    referencePricePerSqm: 20,
    referencePoints: withPoints
      ? [{ label: 'Travail', latitude: 43.7, longitude: 7.26, mode: 'walking' }]
      : [],
  });
}

async function call(
  db: Database,
  userId: string | null,
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Response> {
  const url = new URL(`${BASE}${path}`);
  const request = new Request(url, {
    method: init.method ?? 'GET',
    ...(init.headers === undefined ? {} : { headers: init.headers }),
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const segments = url.pathname.split('/').filter((part) => part !== '');
  return route(db, request, url, segments, {}, userId);
}

/** Ce que la liste rend maintenant, par identifiant. */
async function nouvelle(db: Database, userId: string): Promise<Map<string, unknown>> {
  const response = await call(db, userId, '/api/listings?all=true&archived=true&limit=500');
  expect(response.status).toBe(200);
  const body = JSON.parse(await response.text()) as { listings: { id: string }[] };
  return new Map(body.listings.map((listing) => [listing.id, listing]));
}

/** Ce que rendait l'ancienne requête, par identifiant. */
async function ancienne(db: Database, userId: string): Promise<Map<string, unknown>> {
  const result = await db.execute({
    sql: avant(userId === ANONYMOUS_USER),
    args: [userId, userId],
  });
  return new Map(
    result.rows.map((row) => {
      const listing = rowToListing(row as Record<string, unknown>);
      return [String(listing['id']), listing];
    }),
  );
}

async function expectSameAsBefore(db: Database, userId: string): Promise<void> {
  const avant = await ancienne(db, userId);
  const apres = await nouvelle(db, userId);
  expect(apres.size).toBe(avant.size);
  expect(avant.size).toBeGreaterThan(0);
  for (const [id, listing] of avant) expect(apres.get(id), id).toEqual(listing);
}

describe('la liste assemblée à partir des colonnes préparées', () => {
  let db: Database;
  const ids = ['orpi:1', 'orpi:2', 'orpi:3', 'orpi:4'];

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    const repository = createRepository(db);
    await repository.upsertOccurrences(ids.map((id) => makeOccurrence({ id, sourceId: 'orpi' })));
    await repository.saveListings(ids.map((id, index) => scored(id, index, true)));
    await db.batch(
      [
        { sql: "INSERT INTO users (id, created_at) VALUES ('alice', datetime('now'))", args: [] },
        { sql: "INSERT INTO users (id, created_at) VALUES ('bob', datetime('now'))", args: [] },
      ],
      'write',
    );
    // Alice a SES scores — un budget plus serré que celui de la fiche — et ses
    // trajets ; Bob n'en a aucun, comme un visiteur.
    await repository.saveUserScores(
      'alice',
      ids.map((id, index) => scored(id, index, true, 650)),
    );
  });

  it('rend exactement ce que rendait l’ancienne requête, pour chaque lecteur', async () => {
    const synced = await db.execute(
      'SELECT COUNT(*) AS n FROM listings WHERE list_hash = content_hash AND list_payload IS NOT NULL',
    );
    expect(Number(synced.rows[0]?.['n'])).toBe(ids.length);
    for (const userId of ['alice', 'bob', 'anonyme']) await expectSameAsBefore(db, userId);
    // Les scores d'Alice ne sont pas ceux de la fiche : sans quoi rien ne
    // distinguerait les siens de ceux qu'on sert à Bob.
    const chez = async (userId: string): Promise<string> =>
      JSON.stringify((await nouvelle(db, userId)).get('orpi:4'));
    expect(await chez('alice')).not.toBe(await chez('bob'));
  });

  it('ne transporte ni description, ni raisons, ni trajets d’un autre', async () => {
    const response = await call(db, 'bob', '/api/listings?all=true');
    const text = await response.text();
    expect(text).not.toContain('Description longue');
    expect(text).not.toContain('Travail');
    const alice = await (await call(db, 'alice', '/api/listings?all=true')).text();
    expect(alice).toContain('Travail');
    const { listings } = JSON.parse(alice) as {
      listings: { scores: Record<string, { reasons: unknown[] }> }[];
    };
    const raisons = listings.flatMap((one) => Object.values(one.scores).map((s) => s.reasons));
    expect(raisons.length).toBeGreaterThan(0);
    expect(raisons.every((list) => list.length === 0)).toBe(true);
    // Chaque clé une seule fois : rien n'est transporté pour être écrasé.
    expect(alice.match(/"scores":/g)?.length).toBe(listings.length);
    expect(alice.match(/"distances":/g)?.length).toBe(listings.length);
  });

  it('garde la même précédence quand l’état personnel diverge de la fiche', async () => {
    await db.batch(
      [
        {
          sql: `INSERT INTO listing_user_state
                  (user_id, listing_id, viewed, archived, favorite, tracking, notified_at,
                   gone_notified_at, reminded_at, updated_at)
                VALUES ('alice', 'orpi:1', 1, 1, 1, 'contacted', '2026-09-01T10:00:00.000Z',
                        '2026-09-02T10:00:00.000Z', NULL, datetime('now'))`,
          args: [],
        },
        // orpi:2 n'a aucun état personnel : la fiche ne porte plus de colonnes
        // homonymes depuis la migration 0042, il n'y a donc plus rien à écraser.
        // Fermée aux candidatures : archivée d'office, sans écriture.
        {
          sql: `UPDATE listings
                   SET payload = json_set(payload, '$.applicationStatus', 'full'),
                       list_payload = json_set(list_payload, '$.applicationStatus', 'full')
                 WHERE id = 'orpi:3'`,
          args: [],
        },
      ],
      'write',
    );
    await expectSameAsBefore(db, 'alice');
    const apres = await nouvelle(db, 'alice');
    expect((apres.get('orpi:3') as { archived: boolean }).archived).toBe(true);
    // L'état d'Alice gagne ; les colonnes homonymes de la fiche ne comptent pas.
    expect(apres.get('orpi:1')).toMatchObject({
      viewed: true,
      archived: true,
      favorite: true,
      tracking: 'contacted',
      notifiedAt: '2026-09-01T10:00:00.000Z',
    });
    expect(apres.get('orpi:2')).toMatchObject({ viewed: false, notifiedAt: null });
  });

  it('retombe sur le calcul d’avant pour une fiche réécrite sans ses colonnes', async () => {
    // Un code qui ignore les colonnes préparées change l'empreinte, pas elles.
    await db.execute({
      sql: `UPDATE listings SET content_hash = 'réécrite',
              payload = json_set(payload, '$.title.value', 'Titre changé')
            WHERE id = 'orpi:2'`,
      args: [],
    });
    await db.execute({
      sql: `UPDATE listing_user_score SET content_hash = 'réécrit' WHERE listing_id = 'orpi:4'`,
      args: [],
    });
    await expectSameAsBefore(db, 'alice');
    const apres = await nouvelle(db, 'alice');
    expect(JSON.stringify(apres.get('orpi:2'))).toContain('Titre changé');
  });

  it('tolère un score personnel illisible comme avant', async () => {
    await db.batch(
      [
        {
          sql: `UPDATE listing_user_score SET scores = 'pas du json', distances = '{oups',
                  content_hash = 'x' WHERE listing_id = 'orpi:1'`,
          args: [],
        },
        {
          sql: `UPDATE listing_user_score SET scores = 'null', distances = 'null', content_hash = 'y'
                 WHERE listing_id = 'orpi:2'`,
          args: [],
        },
      ],
      'write',
    );
    await expectSameAsBefore(db, 'alice');
  });

  it('reprend l’existant par la migration, à l’identique', async () => {
    await db.batch(
      [
        {
          sql: 'UPDATE listings SET list_payload = NULL, list_scores = NULL, list_hash = NULL',
          args: [],
        },
        { sql: 'UPDATE listing_user_score SET list_scores = NULL, list_hash = NULL', args: [] },
      ],
      'write',
    );
    // Aucune colonne préparée : tout passe par le calcul d'avant.
    await expectSameAsBefore(db, 'alice');

    const sql = await readFile(resolve(MIGRATIONS, '0040_list_payload.sql'), 'utf8');
    for (const statement of splitStatements(sql).filter((one) => one.startsWith('UPDATE'))) {
      await db.execute(statement);
    }
    const ready = await db.execute(
      `SELECT (SELECT COUNT(*) FROM listings WHERE list_hash = content_hash) AS listings,
              (SELECT COUNT(*) FROM listing_user_score WHERE list_hash = content_hash) AS scores`,
    );
    expect(Number(ready.rows[0]?.['listings'])).toBe(ids.length);
    expect(Number(ready.rows[0]?.['scores'])).toBe(ids.length);
    for (const userId of ['alice', 'bob', 'anonyme']) await expectSameAsBefore(db, userId);
  });
});

describe('la liste en requête conditionnelle', () => {
  let db: Database;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    const repository = createRepository(db);
    await repository.upsertOccurrences([makeOccurrence({ id: 'orpi:1', sourceId: 'orpi' })]);
    await repository.saveListings([scored('orpi:1', 0, false)]);
    await db.batch(
      [
        { sql: "INSERT INTO users (id, created_at) VALUES ('alice', datetime('now'))", args: [] },
        { sql: "INSERT INTO users (id, created_at) VALUES ('bob', datetime('now'))", args: [] },
      ],
      'write',
    );
    for (const userId of ['alice', 'bob']) {
      await repository.saveUserScores(userId, [scored('orpi:1', 0, false)]);
    }
  });

  const PATH = '/api/listings?sort=priority&limit=500';

  it('répond 304 sans corps à une copie encore bonne, et 200 après un changement', async () => {
    const first = await call(db, 'alice', PATH);
    expect(first.status).toBe(200);
    expect(first.headers.get('Cache-Control')).toBe('private, no-cache');
    const etag = first.headers.get('ETag') ?? '';
    expect(etag).toMatch(/^W\/"[0-9a-f]{32}"$/);

    const again = await call(db, 'alice', PATH, { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
    expect(again.headers.get('ETag')).toBe(etag);

    // Un favori posé : l'état du compte a bougé.
    await new Promise((done) => setTimeout(done, 5));
    await call(db, 'alice', '/api/listings/orpi:1', { method: 'PATCH', body: { favorite: true } });
    const changed = await call(db, 'alice', PATH, { headers: { 'If-None-Match': etag } });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('ETag')).not.toBe(etag);
    const body = JSON.parse(await changed.text()) as { listings: { favorite: boolean }[] };
    expect(body.listings[0]?.favorite).toBe(true);
  });

  it('change d’empreinte quand la collecte réécrit le score du compte', async () => {
    const etag = (await call(db, 'alice', PATH)).headers.get('ETag') ?? '';
    await new Promise((done) => setTimeout(done, 5));
    await db.execute({
      sql: "UPDATE listing_user_score SET action_priority = 99, updated_at = ? WHERE user_id = 'alice'",
      args: [new Date(Date.now() + 1000).toISOString()],
    });
    const after = await call(db, 'alice', PATH, { headers: { 'If-None-Match': etag } });
    expect(after.status).toBe(200);
  });

  it('ne confirme pas à un compte la copie d’un autre', async () => {
    const alice = (await call(db, 'alice', PATH)).headers.get('ETag') ?? '';
    const bob = await call(db, 'bob', PATH, { headers: { 'If-None-Match': alice } });
    expect(bob.status).toBe(200);
  });

  it('change d’empreinte quand les critères du compte changent', async () => {
    const etag = (await call(db, 'alice', PATH)).headers.get('ETag') ?? '';
    await call(db, 'alice', '/api/config', {
      method: 'PUT',
      body: { cities: ['nice'], maxPrice: 5000, minArea: 5, districts: ['port'] },
    });
    const after = await call(db, 'alice', PATH, { headers: { 'If-None-Match': etag } });
    expect(after.status).toBe(200);
  });

  it('distingue deux tris du même contenu', async () => {
    const etag = (await call(db, 'alice', PATH)).headers.get('ETag') ?? '';
    const other = await call(db, 'alice', '/api/listings?sort=price&limit=500', {
      headers: { 'If-None-Match': etag },
    });
    expect(other.status).toBe(200);
  });
});
