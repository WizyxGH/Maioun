/**
 * CE QU'UN PASSAGE LIT, ET CE QUE ÇA COÛTE.
 *
 * Turso facture les LIGNES LUES, et le 24 septembre 2026 le plafond mensuel a
 * été atteint : la base a refusé toute lecture — l'export compris — et la
 * collecte a échoué en boucle. Une requête sans index ne se voit pas à la
 * relecture : elle rend le bon résultat, simplement en balayant toute la
 * table, quatre-vingt-seize fois par jour.
 *
 * Ces tests lisent le PLAN de SQLite, pas le résultat : une requête de
 * passage qui annonce « SCAN » sur une table qui grandit sans fin est une
 * facture qui grandit avec elle.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from './client.js';
import { migrate } from './migrate.js';
import { silentLogger } from '../core/logger.js';

const MIGRATIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../database/migrations',
);

let db: Database;

beforeAll(async () => {
  db = openDatabase({ url: ':memory:' });
  await migrate(db, MIGRATIONS, silentLogger);
});

/** Le plan de SQLite pour une requête, en une chaîne. */
async function plan(sql: string, args: readonly string[]): Promise<string> {
  const result = await db.execute({ sql: `EXPLAIN QUERY PLAN ${sql}`, args: [...args] });
  return result.rows.map((row) => String(row['detail'])).join(' | ');
}

describe('l’historique se lit par index, jamais en entier', () => {
  // `listing_history` ne perd jamais une ligne : chaque changement de loyer y
  // reste. La balayer à chaque passage coûte donc de plus en plus cher.
  const hier = '2026-09-23T00:00:00.000Z';

  it('les retours en ligne récents (recentReappearedIds)', async () => {
    const detail = await plan(
      `SELECT DISTINCT occurrence_id FROM listing_history
       WHERE change = 'reappeared' AND recorded_at >= ?`,
      [hier],
    );
    expect(detail).toContain('idx_history_change');
    expect(detail).not.toContain('SCAN listing_history');
  });

  it('les baisses de prix récentes (recentPriceDropIds)', async () => {
    const detail = await plan(
      `SELECT DISTINCT occurrence_id FROM listing_history
       WHERE change = 'price-drop' AND recorded_at >= ?`,
      [hier],
    );
    expect(detail).toContain('idx_history_change');
    expect(detail).not.toContain('SCAN listing_history');
  });
});
