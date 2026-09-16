/**
 * La liste d'un visiteur filtrée par une recherche partagée.
 *
 * Un lien de recherche ouvert sans compte n'avait que le catalogue : budget,
 * surface, exclusions et quartiers du lien ne s'appliquaient pas. Les critères
 * passent désormais en paramètre, lus et jamais écrits.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createRepository,
  migrate,
  openDatabase,
  scoreListing,
  silentLogger,
  type Database,
} from '@maioun/collector';
import { route } from '../../packages/collector/src/server/routes.js';
import { MVP_CRITERIA } from '@maioun/shared';
import { makeAggregated, makeOccurrence } from '../helpers/factories.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../database/migrations');
const BASE = 'https://exemple.invalid';

async function call(
  db: Database,
  userId: string | null,
  path: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const url = new URL(`${BASE}${path}`);
  const segments = url.pathname.split('/').filter((part) => part !== '');
  return route(db, new Request(url, { headers }), url, segments, {}, userId);
}

async function ids(response: Response): Promise<string[]> {
  expect(response.status).toBe(200);
  const body = JSON.parse(await response.text()) as { listings: { id: string }[] };
  return body.listings.map((listing) => listing.id).sort();
}

function withCriteria(criteria: unknown): string {
  return `/api/listings?limit=500&criteria=${encodeURIComponent(JSON.stringify(criteria))}`;
}

async function writes(db: Database): Promise<number> {
  const result = await db.execute('SELECT COUNT(*) AS n FROM app_settings');
  return Number(result.rows[0]?.['n']);
}

describe('liste d’un visiteur avec les critères d’une recherche partagée', () => {
  let db: Database;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    const repository = createRepository(db);
    const fiches = [
      { id: 'orpi:cher', price: 900, area: 40 },
      { id: 'orpi:petit', price: 500, area: 15 },
      { id: 'orpi:bon', price: 600, area: 30 },
      { id: 'orpi:etudiant', price: 550, area: 28, studentOnly: true },
    ];
    await repository.upsertOccurrences(
      fiches.map(({ id }) => makeOccurrence({ id, sourceId: 'orpi' })),
    );
    await repository.saveListings(
      fiches.map(({ id, price, area }) =>
        scoreListing(
          makeAggregated({
            id,
            price,
            area,
            occurrences: [makeOccurrence({ id, sourceId: 'orpi' })],
          }),
          {
            criteria: { ...MVP_CRITERIA, maxPrice: 5000, minArea: 1 },
            nowMs: Date.now(),
            referencePricePerSqm: 20,
            referencePoints: [],
          },
        ),
      ),
    );
    await db.execute("UPDATE listings SET student_only = 1 WHERE id = 'orpi:etudiant'");
    await db.execute("INSERT INTO users (id, created_at) VALUES ('alice', datetime('now'))");
  });

  const criteria = { cities: ['nice'], maxPrice: 700, minArea: 20, excludeStudent: true };

  it('applique budget, surface et exclusions, sans rien écrire', async () => {
    expect(await ids(await call(db, null, '/api/listings?limit=500'))).toEqual([
      'orpi:bon',
      'orpi:cher',
      'orpi:etudiant',
      'orpi:petit',
    ]);
    expect(await ids(await call(db, null, withCriteria(criteria)))).toEqual(['orpi:bon']);
    expect(
      await ids(await call(db, null, withCriteria({ ...criteria, excludeStudent: false }))),
    ).toEqual(['orpi:bon', 'orpi:etudiant']);
    // Une autre commune : rien de Nice ne passe.
    expect(
      await ids(await call(db, null, withCriteria({ ...criteria, cities: ['antibes'] }))),
    ).toEqual([]);
    expect(await writes(db)).toBe(0);
  });

  it('distingue deux recherches dans l’empreinte', async () => {
    const first = await call(db, null, withCriteria(criteria));
    const etag = first.headers.get('ETag') ?? '';
    const other = await call(db, null, withCriteria({ ...criteria, maxPrice: 1000 }), {
      'If-None-Match': etag,
    });
    expect(other.status).toBe(200);
    const same = await call(db, null, withCriteria(criteria), { 'If-None-Match': etag });
    expect(same.status).toBe(304);
    const catalogue = await call(db, null, '/api/listings?limit=500', { 'If-None-Match': etag });
    expect(catalogue.status).toBe(200);
  });

  it('refuse des critères illisibles ou démesurés', async () => {
    const bad = [
      '/api/listings?criteria=%7Bpas-du-json',
      withCriteria({ cities: ['nice'], maxPrice: 'beaucoup', minArea: 20 }),
      withCriteria({ maxPrice: 700, minArea: 20 }),
      withCriteria([1, 2]),
      withCriteria({ ...criteria, cities: Array.from({ length: 30 }, (_, i) => `ville${i}`) }),
      `/api/listings?criteria=${'x'.repeat(5000)}`,
    ];
    for (const path of bad) expect((await call(db, null, path)).status, path).toBe(400);
    expect(await writes(db)).toBe(0);
  });

  it('est ignoré pour un compte, qui lit ses propres critères', async () => {
    const repository = createRepository(db);
    const all = await db.execute('SELECT id FROM listings');
    expect(all.rows.length).toBe(4);
    await repository.saveUserScores(
      'alice',
      ['orpi:cher', 'orpi:petit', 'orpi:bon', 'orpi:etudiant'].map((id) =>
        scoreListing(
          makeAggregated({
            id,
            price: 600,
            area: 30,
            occurrences: [makeOccurrence({ id, sourceId: 'orpi' })],
          }),
          {
            criteria: { ...MVP_CRITERIA, maxPrice: 5000, minArea: 1 },
            nowMs: Date.now(),
            referencePricePerSqm: 20,
            referencePoints: [],
          },
        ),
      ),
    );
    const plain = await ids(await call(db, 'alice', '/api/listings?limit=500'));
    const withParam = await call(db, 'alice', withCriteria({ ...criteria, maxPrice: 1 }));
    expect(await ids(withParam)).toEqual(plain);
    // Même un paramètre illisible ne change rien pour un compte.
    expect((await call(db, 'alice', '/api/listings?criteria=%7B')).status).toBe(200);
    expect(await writes(db)).toBe(0);
  });
});
