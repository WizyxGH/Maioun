/**
 * Une annonce que la source CONFIRME est une annonce vue.
 *
 * Quinze sources confirment des annonces sans les rendre — liste relue sans
 * retélécharger la fiche, page inchangée (304). Ces références étaient
 * seulement épargnées du décompte des absences : une annonce déjà « peut-être
 * retirée » qui réapparaissait ainsi le restait, alors que la source la dit
 * publiée. Sur une vraie base, migrations comprises.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createRepository,
  migrate,
  openDatabase,
  silentLogger,
  type Database,
  type Repository,
} from '@maioun/collector';
import { makeOccurrence } from '../helpers/factories.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../database/migrations');

async function etat(db: Database, id: string) {
  const found = await db.execute({
    sql: 'SELECT lifecycle, missing_runs, last_seen_at FROM occurrences WHERE id = ?',
    args: [id],
  });
  const row = found.rows[0];
  return {
    lifecycle: String(row?.['lifecycle']),
    missing: Number(row?.['missing_runs']),
    lastSeen: String(row?.['last_seen_at']),
  };
}

describe('confirmation par la source', () => {
  let db: Database;
  let repository: Repository;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
    await repository.upsertOccurrences([
      makeOccurrence({ id: 'bienici:A', sourceId: 'bienici', sourceRef: 'A' }),
      makeOccurrence({ id: 'bienici:B', sourceId: 'bienici', sourceRef: 'B' }),
    ]);
  });

  it('RÉTABLIT une annonce en doute que la source confirme', async () => {
    // Deux passages sans la voir : elle passe « peut-être retirée ».
    const seuils = { possiblyInactiveAfter: 2, inactiveAfter: 3 };
    await repository.markMissing('bienici', new Set(['B']), seuils);
    await repository.markMissing('bienici', new Set(['B']), seuils);
    expect((await etat(db, 'bienici:A')).lifecycle).toBe('possiblyInactive');

    // Puis sa page répond 304 : la source la confirme sans la rendre.
    await repository.confirmSeen('bienici', ['A'], '2026-09-10T19:30:00.000Z');

    expect(await etat(db, 'bienici:A')).toEqual({
      lifecycle: 'active',
      missing: 0,
      lastSeen: '2026-09-10T19:30:00.000Z',
    });
  });

  it('ne touche QUE la source nommée', async () => {
    // Deux sources peuvent partager une référence ; confirmer chez l'une ne dit
    // rien de l'autre.
    await repository.upsertOccurrences([
      makeOccurrence({ id: 'orpi:A', sourceId: 'orpi', sourceRef: 'A' }),
    ]);
    await db.execute("UPDATE occurrences SET lifecycle = 'inactive', missing_runs = 3");
    await repository.confirmSeen('bienici', ['A'], '2026-09-10T19:30:00.000Z');
    expect((await etat(db, 'orpi:A')).lifecycle).toBe('inactive');
    expect((await etat(db, 'bienici:A')).lifecycle).toBe('active');
  });
});

describe('mémoire des pages', () => {
  it('rend ce qu’une page portait, et rien pour une page inconnue', async () => {
    const db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    const repository = createRepository(db);

    expect(await repository.pageRefs('https://exemple.invalid/p1')).toBeNull();
    await repository.savePageRefs('https://exemple.invalid/p1', ['A', 'B'], '2026-09-10T19:00:00Z');
    expect(await repository.pageRefs('https://exemple.invalid/p1')).toEqual(['A', 'B']);

    // Une page qui change remplace sa mémoire, elle ne l'additionne pas.
    await repository.savePageRefs('https://exemple.invalid/p1', ['C'], '2026-09-10T19:30:00Z');
    expect(await repository.pageRefs('https://exemple.invalid/p1')).toEqual(['C']);
  });
});
