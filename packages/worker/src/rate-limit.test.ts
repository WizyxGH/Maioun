import { describe, expect, it } from 'vitest';
import type { Client } from '@libsql/client/web';
import { allow, bucketFor, callerKey, fingerprint } from './rate-limit.js';

type Row = Record<string, unknown>;

/** Une base réduite à la seule table `rate_limits`. */
function fakeDb(options: { failing?: boolean } = {}): Client {
  const rows: Row[] = [];
  const run = (sql: string, args: unknown[]): Row[] => {
    if (options.failing === true) throw new Error('base indisponible');
    if (sql.startsWith('SELECT count, window_start')) {
      return rows.filter((row) => row['bucket'] === args[0]);
    }
    if (sql.startsWith('INSERT INTO rate_limits')) {
      const found = rows.find((row) => row['bucket'] === args[0]);
      if (found === undefined) rows.push({ bucket: args[0], count: 1, window_start: args[1] });
      else {
        found['count'] = 1;
        found['window_start'] = args[1];
      }
      return [];
    }
    if (sql.startsWith('UPDATE rate_limits')) {
      const found = rows.find((row) => row['bucket'] === args[0]);
      if (found !== undefined) found['count'] = Number(found['count']) + 1;
      return [];
    }
    throw new Error(`SQL non prévu par le double : ${sql}`);
  };
  return {
    execute: (statement: { sql: string; args: unknown[] }) =>
      Promise.resolve({ rows: run(statement.sql, statement.args) }),
  } as unknown as Client;
}

const NOW = Date.parse('2026-09-07T12:00:00.000Z');
const HOUR = 3_600_000;
const QUOTA = { limit: 3, windowMs: HOUR };

describe('allow', () => {
  it('laisse passer le quota, puis refuse', async () => {
    const db = fakeDb();
    expect(await allow(db, 'signup:abc', QUOTA, NOW)).toBe(true);
    expect(await allow(db, 'signup:abc', QUOTA, NOW)).toBe(true);
    expect(await allow(db, 'signup:abc', QUOTA, NOW)).toBe(true);
    expect(await allow(db, 'signup:abc', QUOTA, NOW)).toBe(false);
  });

  it('rouvre quand la fenêtre est révolue', async () => {
    const db = fakeDb();
    for (let i = 0; i < 3; i += 1) await allow(db, 'signup:abc', QUOTA, NOW);
    expect(await allow(db, 'signup:abc', QUOTA, NOW)).toBe(false);
    expect(await allow(db, 'signup:abc', QUOTA, NOW + HOUR + 1)).toBe(true);
  });

  it('compte chaque seau séparément', async () => {
    const db = fakeDb();
    for (let i = 0; i < 3; i += 1) await allow(db, 'signup:abc', QUOTA, NOW);
    expect(await allow(db, 'signup:abc', QUOTA, NOW)).toBe(false);
    expect(await allow(db, 'signup:autre', QUOTA, NOW)).toBe(true);
  });

  it('LAISSE PASSER quand la base est en panne', async () => {
    // Un limiteur en panne ne doit pas fermer le service : refuser toutes les
    // inscriptions parce qu'une requête a échoué serait s'infliger soi-même la
    // panne dont on se protège.
    expect(await allow(fakeDb({ failing: true }), 'signup:abc', QUOTA, NOW)).toBe(true);
  });
});

describe('empreinte de l’appelant', () => {
  it('ne conserve jamais l’adresse en clair', async () => {
    const bucket = await bucketFor('signup', '203.0.113.7');
    expect(bucket).not.toContain('203.0.113.7');
    expect(bucket).toMatch(/^signup:[0-9a-f]{16}$/);
  });

  it('sépare les seaux d’une MÊME adresse selon l’action', async () => {
    // Sans le sel, on recouperait deux seaux pour savoir que la même personne
    // s'est inscrite ET a demandé un lien.
    expect(await fingerprint('signup', '203.0.113.7')).not.toBe(
      await fingerprint('forgot', '203.0.113.7'),
    );
  });

  it('se rabat sur un seau commun quand la plateforme ne dit rien', () => {
    expect(callerKey(new Request('https://exemple.invalid/'))).toBe('inconnu');
    expect(
      callerKey(
        new Request('https://exemple.invalid/', {
          headers: { 'CF-Connecting-IP': '198.51.100.4' },
        }),
      ),
    ).toBe('198.51.100.4');
  });
});
