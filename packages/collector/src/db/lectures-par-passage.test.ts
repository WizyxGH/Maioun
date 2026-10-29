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
import { createRepository } from './repository.js';
import { route } from '../server/routes.js';

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

/**
 * Les instructions qu'une opération envoie VRAIMENT, et leurs plans : on lit
 * le SQL du code et non une copie, qui pourrait diverger sans qu'aucun test
 * ne le voie.
 */
async function plansOf(action: (spy: Database) => Promise<unknown>): Promise<string[]> {
  const sent: { sql: string; args: unknown[] }[] = [];
  const note = (statement: unknown): void => {
    if (typeof statement === 'string') sent.push({ sql: statement, args: [] });
    else {
      const one = statement as { sql: string; args?: unknown[] };
      sent.push({ sql: one.sql, args: one.args ?? [] });
    }
  };
  const spy = new Proxy(db, {
    get(target, key, receiver) {
      if (key === 'execute') {
        return (statement: unknown) => {
          note(statement);
          return target.execute(statement as never);
        };
      }
      if (key === 'batch') {
        // Le plan suffit : les lots ne sont pas exécutés.
        return async (statements: unknown[]) => {
          statements.forEach(note);
          return statements.map(() => ({ rows: [], rowsAffected: 0 }));
        };
      }
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
  await action(spy);
  const plans: string[] = [];
  for (const one of sent) {
    plans.push(await plan(one.sql, one.args as string[]));
  }
  return plans;
}

describe('les requêtes PAR SOURCE ne relisent ni les éteintes ni toute la source', () => {
  // 85 sources par cycle, 66 cycles par jour : chacune de ces requêtes
  // balayait la source entière, stock éteint compris, qui ne fait que grandir.

  it('la péremption par âge (expireByAge) part d’une date limite indexée', async () => {
    const plans = await plansOf((spy) =>
      createRepository(spy).expireByAge('orpi', {
        possiblyInactiveAfterDays: 21,
        inactiveAfterDays: 45,
      }),
    );
    expect(plans).toHaveLength(2);
    for (const detail of plans) {
      expect(detail).toContain('idx_occurrences_vivantes (source_id=? AND last_seen_at<?)');
    }
  });

  it('les bascules d’absents (markMissing) ne visitent que les absents', async () => {
    const plans = await plansOf((spy) =>
      createRepository(spy).markMissing('orpi', new Set(['a']), {
        possiblyInactiveAfter: 2,
        inactiveAfter: 3,
      }),
    );
    expect(plans.slice(1)).toHaveLength(2);
    for (const detail of plans.slice(1)) {
      expect(detail).toContain('idx_occurrences_vivantes_absentes');
    }
    for (const detail of plans) expect(detail).not.toContain('SCAN occurrences');
  });

  it('la relecture des plus anciennes (knownRefs) suit l’ordre de l’index', async () => {
    const plans = await plansOf((spy) => createRepository(spy).knownRefs('orpi'));
    expect(plans.join(' | ')).toContain('idx_occurrences_vivantes_relues');
    for (const detail of plans) expect(detail).not.toContain('SCAN occurrences');
  });
});

describe('la purge des fiches orphelines ne matérialise plus toutes les occurrences', () => {
  // `id NOT IN (SELECT group_id FROM occurrences)` relisait la table entière,
  // une fois par fusion : 61 700 lignes pour dix fusions sur la base locale.
  it('chaque fiche candidate coûte une entrée d’index', async () => {
    const plans = await plansOf((spy) => createRepository(spy).absorbOrphanListings());
    expect(plans[0]).toContain('idx_occurrences_group (group_id=?)');
  });
});

describe('les candidatures fermées se trouvent sans relire toutes les fiches', () => {
  // Le statut est dans le JSON de la fiche : sans index partiel, chaque passage
  // relisait toutes les fiches (4 654 en local) pour en trouver trois.
  it('noteClosedApplications part de l’index partiel', async () => {
    const plans = await plansOf((spy) => createRepository(spy).noteClosedApplications('moi'));
    expect(plans.join(' | ')).toContain('idx_listings_candidatures_closes');
    for (const detail of plans) expect(detail).not.toMatch(/SCAN listings(?! USING)/);
  });
});

describe('l’élagage des journaux lit par date', () => {
  it('l’historique ne se balaie plus en entier à chaque passage', async () => {
    const plans = await plansOf((spy) => createRepository(spy).pruneLogs(Date.now()));
    expect(plans.join(' | ')).toContain('idx_history_recorded');
    expect(plans.join(' | ')).not.toContain('SCAN listing_history');
  });
});

describe('le site ne relit pas la liste pour dire « rien n’a changé »', () => {
  async function get(spy: Database, path: string, headers: Record<string, string> = {}) {
    const url = new URL(`https://api.example.invalid${path}`);
    const segments = url.pathname.split('/').filter((part) => part !== '');
    return route(spy, new Request(url, { headers }), url, segments, {}, 'moi');
  }

  it('l’empreinte (sondée chaque minute par onglet) ne balaie aucune table', async () => {
    const first = await get(db, '/api/listings?sort=recent');
    const etag = first.headers.get('ETag') ?? '';
    const plans = await plansOf(async (spy) => {
      const again = await get(spy, '/api/listings?sort=recent', { 'If-None-Match': etag });
      expect(again.status).toBe(304);
    });
    for (const detail of plans) {
      expect(detail).not.toMatch(/SCAN (listings|listing_user_state|listing_user_score)/);
      // Les fiches ne se lisent que par la dernière date de modification.
      expect(detail).not.toMatch(/SEARCH listings (?!USING COVERING INDEX idx_listings_updated)/);
    }
  });

  it('l’écran Sources lit le dernier passage de chaque source, pas le mois', async () => {
    const plans = await plansOf((spy) => get(spy, '/api/sources'));
    // Les cinquante derniers passages, eux, se lisent bien par date.
    const dernier = plans.find((detail) => detail.includes('AS r') || detail.includes(' r '));
    expect(dernier).toContain('idx_runs_source');
    expect(dernier).not.toContain('idx_runs_started');
  });
});
